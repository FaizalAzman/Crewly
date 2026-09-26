import { prisma } from "@/lib/db";
import { calcOvertimePay, MAX_MONTHLY_OT_HOURS, type DayType } from "@/lib/statutory/employment-act";
import { dayKind } from "@/lib/calendar";
import { parsePeriod, periodOf, round2, todayMY } from "@/lib/utils";
import { assertActOnEmployee, assertCan, assertCanApproveFor, audit, claimTransition, notifyEmployee } from "../guard";
import { ACTIVE_STATUSES } from "@/lib/constants";

export const ATTENDANCE_STATUSES = ["PRESENT", "LATE", "ABSENT", "ON_LEAVE", "HOLIDAY", "REST"];
import { DomainError, type Ctx } from "../types";
import { employeeWorkState, holidaySet, tenantWorkWeek } from "./holiday.service";

// ───────────── Geofence ─────────────

/** Great-circle distance in metres (haversine). */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Minutes late vs a shift start "HH:MM" (Malaysia time), after grace. */
export function lateMinutes(clockIn: Date, shiftStart: string, graceMinutes: number) {
  const [h, m] = shiftStart.split(":").map(Number);
  const my = new Date(clockIn.getTime() + 8 * 3600000);
  const minutesOfDay = my.getUTCHours() * 60 + my.getUTCMinutes();
  const late = minutesOfDay - (h * 60 + m);
  return late > graceMinutes ? late : 0;
}

async function shiftFor(tenantId: string, employeeId: string, date: Date) {
  const roster = await prisma.rosterEntry.findUnique({ where: { employeeId_date: { employeeId, date } }, include: { shift: true } });
  if (roster?.shift) return roster.shift;
  const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { shiftId: true } });
  if (emp?.shiftId) {
    const s = await prisma.shift.findUnique({ where: { id: emp.shiftId } });
    if (s) return s;
  }
  return prisma.shift.findFirst({ where: { tenantId, code: "OFC" } });
}

export async function clockIn(ctx: Ctx, input: { employeeId?: string; lat?: number | null; lng?: number | null; now?: Date; source?: string }) {
  const employeeId = input.employeeId ?? ctx.employeeId;
  if (!employeeId) throw new DomainError("Your login isn't linked to an employee profile.");
  const target = await assertActOnEmployee(ctx, employeeId, "attendance.manage");
  if (!ACTIVE_STATUSES.includes(target.status)) throw new DomainError("Former employees can't clock in.");
  const now = input.now ?? new Date();
  const date = todayMY(now);
  if (date < target.joinDate) throw new DomainError("Clock-in isn't open before the join date.");
  const existing = await prisma.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId, date } } });
  if (existing?.clockIn) throw new DomainError("You've already clocked in today.");

  const emp = await prisma.employee.findFirstOrThrow({ where: { id: employeeId, tenantId: ctx.tenantId }, include: { branch: true } });
  // Geofenced branches: clock-ins outside the fence — or without a location (e.g. GPS denied) — are
  // accepted but flagged (withinFence = false) for HR review rather than blocked.
  let withinFence = true;
  let note: string | null = null;
  if (emp.branch?.latitude != null && emp.branch.longitude != null) {
    if (input.lat == null || input.lng == null) {
      withinFence = false;
      note = "No location shared";
    } else {
      const dist = distanceMeters(input.lat, input.lng, emp.branch.latitude, emp.branch.longitude);
      withinFence = dist <= emp.branch.geofenceMeters;
      if (!withinFence) note = `${Math.round(dist)}m from ${emp.branch.name}`;
    }
  }
  // Self clock-ins can only claim WEB/MOBILE; KIOSK/MANUAL are reserved for HR-entered records.
  const source = input.source === "MOBILE" ? "MOBILE" : "WEB";
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } });
  const shift = await shiftFor(ctx.tenantId, employeeId, date);
  const late = shift ? lateMinutes(now, shift.startTime, tenant.lateGraceMinutes) : 0;

  const rec = await prisma.attendanceRecord.upsert({
    where: { employeeId_date: { employeeId, date } },
    update: { clockIn: now, inLat: input.lat ?? null, inLng: input.lng ?? null, withinFence, note, lateMinutes: late, status: late ? "LATE" : "PRESENT", source },
    create: {
      tenantId: ctx.tenantId,
      employeeId,
      date,
      clockIn: now,
      inLat: input.lat ?? null,
      inLng: input.lng ?? null,
      withinFence,
      note,
      lateMinutes: late,
      status: late ? "LATE" : "PRESENT",
      source,
    },
  });
  return rec;
}

export async function clockOut(ctx: Ctx, input: { employeeId?: string; now?: Date }) {
  const employeeId = input.employeeId ?? ctx.employeeId;
  if (!employeeId) throw new DomainError("Your login isn't linked to an employee profile.");
  await assertActOnEmployee(ctx, employeeId, "attendance.manage");
  const now = input.now ?? new Date();
  const date = todayMY(now);
  const rec = await prisma.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId, date } } });
  if (!rec?.clockIn) throw new DomainError("You haven't clocked in today.");
  if (rec.clockOut) throw new DomainError("You've already clocked out today.");
  if (now <= rec.clockIn) throw new DomainError("Clock-out must be after clock-in.");
  const shift = await shiftFor(ctx.tenantId, employeeId, date);
  const worked = Math.max(0, Math.round((now.getTime() - rec.clockIn.getTime()) / 60000) - (shift?.breakMinutes ?? 60));
  return prisma.attendanceRecord.update({ where: { id: rec.id }, data: { clockOut: now, workedMinutes: worked } });
}

export async function manualAttendance(ctx: Ctx, input: { employeeId: string; date: Date; clockIn: Date | null; clockOut: Date | null; status: string; note: string }) {
  assertCan(ctx, "attendance.manage");
  await assertActOnEmployee(ctx, input.employeeId, "attendance.manage");
  if (!ATTENDANCE_STATUSES.includes(input.status)) throw new DomainError("Unknown attendance status.");
  if (input.date > todayMY()) throw new DomainError("You can't record attendance for a future date.");
  if (!input.note) throw new DomainError("A note is required for manual attendance edits.");
  if (input.clockIn && input.clockOut && input.clockOut <= input.clockIn) throw new DomainError("Clock-out must be after clock-in.");
  const worked = input.clockIn && input.clockOut ? Math.max(0, Math.round((input.clockOut.getTime() - input.clockIn.getTime()) / 60000) - 60) : 0;
  const rec = await prisma.attendanceRecord.upsert({
    where: { employeeId_date: { employeeId: input.employeeId, date: input.date } },
    update: { clockIn: input.clockIn, clockOut: input.clockOut, status: input.status, note: input.note, source: "MANUAL", workedMinutes: worked },
    create: { tenantId: ctx.tenantId, employeeId: input.employeeId, date: input.date, clockIn: input.clockIn, clockOut: input.clockOut, status: input.status, note: input.note, source: "MANUAL", workedMinutes: worked },
  });
  await audit(ctx, "UPDATE", "Attendance", rec.id, `Manual attendance ${input.date.toISOString().slice(0, 10)}: ${input.note}`);
  return rec;
}

// ───────────── Roster ─────────────

export async function assignShift(ctx: Ctx, input: { employeeId: string; date: Date; shiftId: string | null; dayType: "WORK" | "REST" | "OFF" }) {
  assertCan(ctx, "attendance.manage");
  if (input.dayType === "WORK" && !input.shiftId) throw new DomainError("Pick a shift for a working day.");
  // EA s.59: at least one rest day per week — check the 7-day window ending on this date has a REST day if we're overwriting one.
  return prisma.rosterEntry.upsert({
    where: { employeeId_date: { employeeId: input.employeeId, date: input.date } },
    update: { shiftId: input.dayType === "WORK" ? input.shiftId : null, dayType: input.dayType },
    create: { tenantId: ctx.tenantId, employeeId: input.employeeId, date: input.date, shiftId: input.dayType === "WORK" ? input.shiftId : null, dayType: input.dayType },
  });
}

/** EA s.59(1): every employee is entitled to one rest day per week. Returns weeks (Mon start) lacking one. */
export function weeksWithoutRestDay(entries: { date: Date; dayType: string }[]) {
  const byWeek = new Map<string, { count: number; rest: boolean }>();
  for (const e of entries) {
    const d = new Date(e.date);
    const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
    const w = byWeek.get(monday) ?? { count: 0, rest: false };
    w.count++;
    if (e.dayType === "REST") w.rest = true;
    byWeek.set(monday, w);
  }
  return [...byWeek.entries()].filter(([, w]) => w.count === 7 && !w.rest).map(([k]) => k);
}

// ───────────── Overtime ─────────────

export async function requestOvertime(ctx: Ctx, input: { employeeId: string; date: Date; hours: number; normalHours?: number; reason?: string }) {
  const emp = await assertActOnEmployee(ctx, input.employeeId, "attendance.manage");
  if (!Number.isFinite(input.hours) || input.hours < 0 || input.hours > 12) throw new DomainError("OT hours must be between 0 and 12 per day.");
  if ((input.normalHours ?? 0) < 0 || (input.normalHours ?? 0) > 12) throw new DomainError("Normal hours must be between 0 and 12.");
  if (input.hours === 0 && !input.normalHours) throw new DomainError("Enter the hours worked.");
  if (input.date > todayMY()) throw new DomainError("OT can only be claimed for days already worked.");

  if (input.date < emp.joinDate) throw new DomainError("OT can't be claimed before the join date.");
  const [ww, state] = await Promise.all([tenantWorkWeek(ctx.tenantId), employeeWorkState(emp.id)]);
  const hol = await holidaySet(ctx.tenantId, state, input.date, input.date);
  const kind = dayKind(input.date, ww, hol);
  const dayType: DayType = kind === "HOLIDAY" ? "PUBLIC_HOLIDAY" : kind === "REST" ? "REST_DAY" : "NORMAL";
  if (dayType === "NORMAL" && input.normalHours) throw new DomainError("Normal hours only apply to rest days and public holidays.");

  // Monthly OT cap (104 hours) — Employment (Limitation of Overtime Work) Regulations 1980.
  const { start, end } = parsePeriod(periodOf(input.date));
  const monthOt = await prisma.overtimeRequest.aggregate({
    where: { employeeId: emp.id, date: { gte: start, lte: end }, status: { in: ["PENDING", "APPROVED", "PAID"] } },
    _sum: { hours: true },
  });
  if ((monthOt._sum.hours ?? 0) + input.hours > MAX_MONTHLY_OT_HOURS) {
    throw new DomainError(`This would exceed the ${MAX_MONTHLY_OT_HOURS}-hour monthly overtime limit.`);
  }
  const dup = await prisma.overtimeRequest.findFirst({ where: { employeeId: emp.id, date: input.date, status: { in: ["PENDING", "APPROVED", "PAID"] } } });
  if (dup) throw new DomainError("There's already an OT claim for this date.");

  const pay = calcOvertimePay({ monthlySalary: emp.basicSalary, normalHoursPerDay: emp.workHoursPerDay, dayType, normalHoursWorked: input.normalHours ?? 0, otHours: input.hours });
  const req = await prisma.overtimeRequest.create({
    data: {
      tenantId: ctx.tenantId,
      employeeId: emp.id,
      date: input.date,
      dayType,
      normalHours: input.normalHours ?? 0,
      hours: input.hours,
      multiplier: pay.multiplier,
      amount: pay.total,
      reason: input.reason,
    },
  });
  if (emp.managerId) await notifyEmployee(emp.managerId, `${emp.preferredName ?? emp.fullName} submitted overtime`, `${input.hours}h · RM${pay.total}`, "/approvals");
  return req;
}

export async function decideOvertime(ctx: Ctx, id: string, approve: boolean) {
  const r = await prisma.overtimeRequest.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { employee: true } });
  if (!r) throw new DomainError("OT request not found.");
  await assertCanApproveFor(ctx, r.employeeId, "overtime.approve");
  if (r.status !== "PENDING") throw new DomainError(`Already ${r.status.toLowerCase()}.`);
  await claimTransition(prisma.overtimeRequest.updateMany({ where: { id, status: "PENDING" }, data: { status: approve ? "APPROVED" : "REJECTED", approverId: ctx.userId } }));
  const updated = await prisma.overtimeRequest.findUniqueOrThrow({ where: { id } });
  await notifyEmployee(r.employeeId, `Your overtime on ${r.date.toISOString().slice(0, 10)} was ${approve ? "approved ✅" : "rejected"}`);
  await audit(ctx, approve ? "APPROVE" : "REJECT", "Overtime", id, `${approve ? "Approved" : "Rejected"} OT for ${r.employee.fullName}`);
  return updated;
}

export function otSummary(rows: { hours: number; amount: number; status: string }[]) {
  const counted = rows.filter((r) => r.status !== "REJECTED");
  return { hours: round2(counted.reduce((s, r) => s + r.hours, 0)), amount: round2(counted.reduce((s, r) => s + r.amount, 0)) };
}

/**
 * End-of-day absence marking: every active employee without a clock-in on a working day (per their state's
 * holidays and the work week) and not on approved leave gets an ABSENT record. Returns how many were marked.
 */
export async function markAbsentees(ctx: Ctx, date: Date) {
  assertCan(ctx, "attendance.manage");
  if (date > todayMY()) throw new DomainError("You can't mark absences for a future date.");
  const ww = await tenantWorkWeek(ctx.tenantId);
  const emps = await prisma.employee.findMany({
    where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROBATION", "NOTICE"] }, joinDate: { lte: date }, OR: [{ lastWorkingDate: null }, { lastWorkingDate: { gte: date } }] },
    include: { branch: true, company: true },
  });
  const [records, leave, roster] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { tenantId: ctx.tenantId, date }, select: { employeeId: true } }),
    prisma.leaveRequest.findMany({ where: { tenantId: ctx.tenantId, status: "APPROVED", startDate: { lte: date }, endDate: { gte: date } }, select: { employeeId: true } }),
    prisma.rosterEntry.findMany({ where: { tenantId: ctx.tenantId, date }, select: { employeeId: true, dayType: true } }),
  ]);
  const has = new Set(records.map((r) => r.employeeId));
  const away = new Set(leave.map((l) => l.employeeId));
  const cache = new Map<string, Set<string>>();
  let marked = 0;
  for (const e of emps) {
    if (has.has(e.id) || away.has(e.id)) continue;
    const r = roster.find((x) => x.employeeId === e.id);
    if (r && r.dayType !== "WORK") continue;
    const state = e.branch?.state ?? e.company.state ?? e.state;
    if (!cache.has(state)) cache.set(state, await holidaySet(ctx.tenantId, state, date, date));
    if (!r && dayKind(date, ww, cache.get(state)!) !== "WORK") continue;
    await prisma.attendanceRecord.create({ data: { tenantId: ctx.tenantId, employeeId: e.id, date, status: "ABSENT", source: "MANUAL", note: "No clock-in, marked absent" } });
    marked++;
  }
  await audit(ctx, "UPDATE", "Attendance", null, `Marked ${marked} absentee(s) for ${date.toISOString().slice(0, 10)}`);
  return marked;
}
