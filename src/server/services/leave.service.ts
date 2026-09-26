import { prisma } from "@/lib/db";
import { countCalendarDays, countWorkingDays } from "@/lib/calendar";
import { annualLeaveDays, HOSPITALISATION_DAYS, serviceYears, sickLeaveDays } from "@/lib/statutory/employment-act";
import { daysBetween, periodOf, round2, todayMY, utcDate } from "@/lib/utils";
import { assertActOnEmployee, assertCan, assertCanApproveFor, audit, claimTransition, notifyEmployee } from "../guard";
import { DomainError, ForbiddenError, type Ctx } from "../types";
import { employeeWorkState, holidaySet, tenantWorkWeek } from "./holiday.service";
import { invalidateCalculatedRuns, periodsBetween } from "./payroll-inputs";

type LeaveTypeRow = Awaited<ReturnType<typeof prisma.leaveType.findFirstOrThrow>>;
type EmpRow = { joinDate: Date; gender: string; lastWorkingDate?: Date | null };

/**
 * Entitlement for a leave type in a given year.
 *  - EA_ANNUAL: s.60E by completed service as at 1 Jan (or join date), pro-rated by completed months
 *    for joiners/leavers in the year (s.60E(1A)); fractions ≥ ½ day round up, < ½ disregarded.
 *  - EA_SICK: s.60F by service, not pro-rated.
 *  - FIXED: defaultDays; NONE: 0.
 */
export function computeEntitlement(type: Pick<LeaveTypeRow, "entitlementRule" | "defaultDays" | "gender">, emp: EmpRow, year: number): number {
  if (type.gender && type.gender !== emp.gender) return 0;
  const yearStart = utcDate(year, 0, 1);
  const yearEnd = utcDate(year, 11, 31);
  if (emp.joinDate > yearEnd) return 0;
  switch (type.entitlementRule) {
    case "EA_ANNUAL": {
      const refDate = emp.joinDate > yearStart ? emp.joinDate : yearStart;
      const base = annualLeaveDays(serviceYears(emp.joinDate, refDate));
      const from = emp.joinDate > yearStart ? emp.joinDate : yearStart;
      const to = emp.lastWorkingDate && emp.lastWorkingDate < yearEnd ? emp.lastWorkingDate : yearEnd;
      const months = completedMonths(from, to);
      if (months >= 12) return base;
      const raw = (base * months) / 12;
      return raw - Math.floor(raw) >= 0.5 ? Math.ceil(raw) : Math.floor(raw);
    }
    case "EA_SICK":
      return sickLeaveDays(serviceYears(emp.joinDate, emp.joinDate > yearStart ? emp.joinDate : yearStart));
    case "FIXED":
      return type.defaultDays;
    default:
      return 0;
  }
}

/** Completed months between two dates, counting a partial month of ≥ 15 days as complete. */
export function completedMonths(from: Date, to: Date): number {
  if (to < from) return 0;
  const endExcl = new Date(to.getTime() + 86400000);
  let months = (endExcl.getUTCFullYear() - from.getUTCFullYear()) * 12 + (endExcl.getUTCMonth() - from.getUTCMonth());
  let rem = endExcl.getUTCDate() - from.getUTCDate();
  if (rem < 0) {
    months -= 1;
    rem += new Date(Date.UTC(endExcl.getUTCFullYear(), endExcl.getUTCMonth(), 0)).getUTCDate();
  }
  if (rem >= 15) months += 1;
  return Math.max(0, Math.min(12, months));
}

export async function initLeaveBalances(tenantId: string, employeeId: string, year: number) {
  const [types, emp] = await Promise.all([
    prisma.leaveType.findMany({ where: { tenantId, active: true } }),
    prisma.employee.findUniqueOrThrow({ where: { id: employeeId } }),
  ]);
  for (const t of types) {
    const entitled = computeEntitlement(t, emp, year);
    await prisma.leaveBalance.upsert({
      where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: t.id, year } },
      update: { entitled },
      create: { employeeId, leaveTypeId: t.id, year, entitled },
    });
  }
}

export function available(b: { entitled: number; carriedForward: number; adjustment: number; taken: number; pending: number }) {
  return round2(b.entitled + b.carriedForward + b.adjustment - b.taken - b.pending);
}

async function getBalance(employeeId: string, leaveTypeId: string, year: number, tenantId: string) {
  let bal = await prisma.leaveBalance.findUnique({ where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } } });
  if (!bal) {
    await initLeaveBalances(tenantId, employeeId, year);
    bal = await prisma.leaveBalance.findUniqueOrThrow({ where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } } });
  }
  return bal;
}

export interface ApplyLeaveInput {
  employeeId: string;
  leaveTypeId: string;
  startDate: Date;
  endDate: Date;
  halfDay?: "AM" | "PM" | null;
  reason?: string | null;
  attachment?: string | null;
}

/** Number of leave days a request would consume, honouring rest days, holidays and half days. */
export async function computeLeaveDays(tenantId: string, employeeId: string, type: LeaveTypeRow, start: Date, end: Date, halfDay?: string | null) {
  if (!type.countsWorkingDaysOnly) return countCalendarDays(start, end);
  const [ww, state] = await Promise.all([tenantWorkWeek(tenantId), employeeWorkState(employeeId)]);
  const hol = await holidaySet(tenantId, state, start, end);
  const days = countWorkingDays(start, end, ww, hol);
  if (halfDay && days > 0) return Math.min(days, 0.5);
  return days;
}

export async function applyLeave(ctx: Ctx, input: ApplyLeaveInput, opts: { onBehalf?: boolean; today?: Date } = {}) {
  const onBehalf = ctx.employeeId !== input.employeeId;
  const today = opts.today ?? todayMY();

  const [emp, type] = await Promise.all([
    assertActOnEmployee(ctx, input.employeeId, "leave.manage"),
    prisma.leaveType.findFirst({ where: { id: input.leaveTypeId, tenantId: ctx.tenantId } }),
  ]);
  if (!type || !type.active) throw new DomainError("Leave type not available.");
  if (["RESIGNED", "TERMINATED", "RETIRED"].includes(emp.status)) throw new DomainError("Former employees can't apply for leave.");

  const { startDate: start, endDate: end } = input;
  if (end < start) throw new DomainError("End date can't be before start date.");
  if (start.getUTCFullYear() !== end.getUTCFullYear()) throw new DomainError("Please split leave that crosses into a new year.");
  if (daysBetween(start, end) > 180) throw new DomainError("A single request can't exceed 180 days.");
  if (emp.lastWorkingDate && end > emp.lastWorkingDate) throw new DomainError("Leave can't extend past your last working day.");
  if (start < emp.joinDate) throw new DomainError("Leave can't start before the join date.");

  if (type.gender && type.gender !== emp.gender) throw new DomainError(`${type.name} is only available to ${type.gender.toLowerCase()} employees.`);
  if (input.halfDay) {
    if (!type.allowHalfDay) throw new DomainError(`${type.name} can't be taken as half days.`);
    if (start.getTime() !== end.getTime()) throw new DomainError("Half-day leave must start and end on the same day.");
  }
  if (type.requiresAttachment && !input.attachment) {
    throw new DomainError(`${type.name} needs a supporting document (e.g. MC number / hospital letter).`);
  }
  if (!onBehalf && type.minNoticeDays > 0 && daysBetween(today, start) < type.minNoticeDays) {
    throw new DomainError(`${type.name} needs at least ${type.minNoticeDays} days' notice.`);
  }

  // Paternity leave — s.60FA: married male employee with ≥ 12 months' service.
  if (type.code === "PL") {
    if (emp.maritalStatus !== "MARRIED") throw new DomainError("Paternity leave is for married employees (EA s.60FA).");
    if (serviceYears(emp.joinDate, start) < 1) throw new DomainError("Paternity leave requires at least 12 months of service (EA s.60FA).");
  }

  const days = await computeLeaveDays(ctx.tenantId, emp.id, type, start, end, input.halfDay);
  if (days <= 0) throw new DomainError("Those dates fall entirely on rest days or public holidays — no leave needed 🎉");

  const overlap = await prisma.leaveRequest.findFirst({
    where: { employeeId: emp.id, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: end }, endDate: { gte: start } },
  });
  if (overlap) {
    const bothHalf = overlap.halfDay && input.halfDay && overlap.halfDay !== input.halfDay && overlap.startDate.getTime() === start.getTime();
    if (!bothHalf) throw new DomainError("You already have leave on some of these dates.");
  }

  const year = start.getUTCFullYear();
  if (type.entitlementRule !== "NONE" || type.code === "RL") {
    const bal = await getBalance(emp.id, type.id, year, ctx.tenantId);
    let avail = available(bal);
    // Hospitalisation (s.60F(1)(b)) — 60 days per year, inclusive of sick leave taken.
    if (type.code === "HL") {
      const sl = await prisma.leaveBalance.findFirst({ where: { employeeId: emp.id, year, leaveType: { code: "SL", tenantId: ctx.tenantId } } });
      avail = Math.min(avail, HOSPITALISATION_DAYS - (sl ? sl.taken + sl.pending : 0) - bal.taken - bal.pending);
    }
    if (days > avail) throw new DomainError(`Not enough ${type.name} balance: requesting ${days}, available ${Math.max(0, avail)}.`);
    // Optimistic lock: only reserve if the balance is unchanged since we read it (guards double submits).
    await claimTransition(
      prisma.leaveBalance.updateMany({ where: { id: bal.id, pending: bal.pending, taken: bal.taken, adjustment: bal.adjustment }, data: { pending: { increment: days } } }),
      "Your leave balance just changed. Please submit again.",
    );
  }

  const request = await prisma.leaveRequest.create({
    data: {
      tenantId: ctx.tenantId,
      employeeId: emp.id,
      leaveTypeId: type.id,
      startDate: start,
      endDate: end,
      halfDay: input.halfDay ?? null,
      days,
      reason: input.reason ?? null,
      attachment: input.attachment ?? null,
      status: "PENDING",
    },
  });
  if (emp.managerId) await notifyEmployee(emp.managerId, `${emp.preferredName ?? emp.fullName} applied for ${type.name}`, `${days} day(s)`, "/approvals");
  await audit(ctx, "CREATE", "LeaveRequest", request.id, `${emp.fullName} applied ${days}d ${type.code}`);
  return request;
}

async function loadRequest(ctx: Ctx, id: string) {
  const r = await prisma.leaveRequest.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { leaveType: true, employee: true } });
  if (!r) throw new DomainError("Leave request not found.");
  return r;
}

function tracksBalance(t: { entitlementRule: string; code: string }) {
  return t.entitlementRule !== "NONE" || t.code === "RL";
}

export async function approveLeave(ctx: Ctx, id: string, note?: string) {
  const r = await loadRequest(ctx, id);
  await assertCanApproveFor(ctx, r.employeeId, "leave.approve");
  if (r.status !== "PENDING") throw new DomainError(`This request is already ${r.status.toLowerCase()}.`);
  const bal = tracksBalance(r.leaveType) ? await getBalance(r.employeeId, r.leaveTypeId, r.startDate.getUTCFullYear(), ctx.tenantId) : null;
  await prisma.$transaction(async (tx) => {
    await claimTransition(
      tx.leaveRequest.updateMany({ where: { id, status: "PENDING" }, data: { status: "APPROVED", approverId: ctx.userId, approverNote: note ?? null, decidedAt: new Date() } }),
    );
    if (bal) await tx.leaveBalance.update({ where: { id: bal.id }, data: { pending: { decrement: r.days }, taken: { increment: r.days } } });
  });
  const updated = await prisma.leaveRequest.findUniqueOrThrow({ where: { id } });
  if (!r.leaveType.paid) await invalidateCalculatedRuns(ctx.tenantId, { companyId: r.employee.companyId, periods: periodsBetween(r.startDate, r.endDate) });
  await notifyEmployee(r.employeeId, `Your ${r.leaveType.name} was approved ✅`, `${r.days} day(s)`, "/me/leave");
  await audit(ctx, "APPROVE", "LeaveRequest", id, `Approved ${r.employee.fullName}'s ${r.leaveType.code} (${r.days}d)`);
  return updated;
}

export async function rejectLeave(ctx: Ctx, id: string, note?: string) {
  const r = await loadRequest(ctx, id);
  await assertCanApproveFor(ctx, r.employeeId, "leave.approve");
  if (r.status !== "PENDING") throw new DomainError(`This request is already ${r.status.toLowerCase()}.`);
  if (!note?.trim()) throw new DomainError("Please give a reason when rejecting leave.");
  const bal = tracksBalance(r.leaveType) ? await getBalance(r.employeeId, r.leaveTypeId, r.startDate.getUTCFullYear(), ctx.tenantId) : null;
  await prisma.$transaction(async (tx) => {
    await claimTransition(
      tx.leaveRequest.updateMany({ where: { id, status: "PENDING" }, data: { status: "REJECTED", approverId: ctx.userId, approverNote: note, decidedAt: new Date() } }),
    );
    if (bal) await tx.leaveBalance.update({ where: { id: bal.id }, data: { pending: { decrement: r.days } } });
  });
  const updated = await prisma.leaveRequest.findUniqueOrThrow({ where: { id } });
  await notifyEmployee(r.employeeId, `Your ${r.leaveType.name} was not approved`, note, "/me/leave");
  await audit(ctx, "REJECT", "LeaveRequest", id, `Rejected ${r.employee.fullName}'s ${r.leaveType.code}`);
  return updated;
}

export async function cancelLeave(ctx: Ctx, id: string, opts: { today?: Date } = {}) {
  const r = await loadRequest(ctx, id);
  const own = ctx.employeeId === r.employeeId;
  if (!own) assertCan(ctx, "leave.manage");
  if (!["PENDING", "APPROVED"].includes(r.status)) throw new DomainError("Only pending or approved leave can be cancelled.");
  const today = opts.today ?? todayMY();
  if (own && r.status === "APPROVED" && r.startDate <= today) throw new ForbiddenError("Leave that has started can only be cancelled by HR.");
  if (r.status === "APPROVED" && !r.leaveType.paid) {
    // Unpaid leave already deducted in a finalised payroll can't silently disappear.
    const finalised = await prisma.payslip.findFirst({
      where: { employeeId: r.employeeId, period: { gte: periodOf(r.startDate), lte: periodOf(r.endDate) }, run: { status: { in: ["APPROVED", "PAID", "LOCKED"] } } },
    });
    if (finalised) throw new DomainError(`Payroll for ${finalised.period} is finalised with this unpaid leave. Refund it through a payroll adjustment instead.`);
  }
  const bal = tracksBalance(r.leaveType) ? await getBalance(r.employeeId, r.leaveTypeId, r.startDate.getUTCFullYear(), ctx.tenantId) : null;
  await prisma.$transaction(async (tx) => {
    await claimTransition(tx.leaveRequest.updateMany({ where: { id, status: r.status }, data: { status: "CANCELLED", decidedAt: new Date() } }));
    if (bal) await tx.leaveBalance.update({ where: { id: bal.id }, data: r.status === "PENDING" ? { pending: { decrement: r.days } } : { taken: { decrement: r.days } } });
  });
  const updated = await prisma.leaveRequest.findUniqueOrThrow({ where: { id } });
  if (r.status === "APPROVED" && !r.leaveType.paid) await invalidateCalculatedRuns(ctx.tenantId, { companyId: r.employee.companyId, periods: periodsBetween(r.startDate, r.endDate) });
  await audit(ctx, "UPDATE", "LeaveRequest", id, `Cancelled ${r.employee.fullName}'s ${r.leaveType.code}`);
  return updated;
}

/** Credit replacement leave (e.g. for working on a public holiday / rest day). */
export async function creditReplacementLeave(ctx: Ctx, employeeId: string, days: number, reason: string) {
  assertCan(ctx, "leave.manage");
  if (days <= 0 || days > 10 || (days * 2) % 1 !== 0) throw new DomainError("Replacement leave credit must be between 0.5 and 10 days, in half days.");
  if (!reason?.trim()) throw new DomainError("Say what the replacement leave is for (e.g. worked on Hari Raya).");
  if (employeeId === ctx.employeeId) throw new ForbiddenError("You can't credit leave to yourself.");
  await assertActOnEmployee(ctx, employeeId, "leave.manage");
  const rl = await prisma.leaveType.findFirst({ where: { tenantId: ctx.tenantId, code: "RL" } });
  if (!rl) throw new DomainError("Replacement leave type is not configured.");
  const bal = await getBalance(employeeId, rl.id, todayMY().getUTCFullYear(), ctx.tenantId);
  await prisma.leaveBalance.update({ where: { id: bal.id }, data: { adjustment: { increment: days } } });
  await audit(ctx, "UPDATE", "LeaveBalance", bal.id, `Credited ${days}d replacement leave: ${reason}`);
}

export async function adjustBalance(ctx: Ctx, balanceId: string, delta: number, reason: string) {
  assertCan(ctx, "leave.manage");
  const bal = await prisma.leaveBalance.findUnique({ where: { id: balanceId }, include: { employee: true } });
  if (!bal || bal.employee.tenantId !== ctx.tenantId) throw new DomainError("Balance not found.");
  if (bal.employeeId === ctx.employeeId) throw new ForbiddenError("You can't adjust your own leave balance.");
  if (!reason) throw new DomainError("A reason is required for balance adjustments.");
  if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 365 || (delta * 2) % 1 !== 0) throw new DomainError("Adjust by a non-zero number of days, in half days.");
  if (available({ ...bal, adjustment: bal.adjustment + delta }) < 0) throw new DomainError("Adjustment would make the balance negative.");
  await prisma.leaveBalance.update({ where: { id: balanceId }, data: { adjustment: { increment: delta } } });
  await audit(ctx, "UPDATE", "LeaveBalance", balanceId, `Adjusted by ${delta}: ${reason}`);
}

/**
 * Year-end carry forward: unused days (up to the type's carryForwardMax) move into next year's balance.
 * Only for active employees. Returns the number of balances carried.
 */
export async function carryForward(ctx: Ctx, fromYear: number) {
  assertCan(ctx, "leave.manage");
  const toYear = fromYear + 1;
  const balances = await prisma.leaveBalance.findMany({
    where: { year: fromYear, leaveType: { tenantId: ctx.tenantId, carryForwardMax: { gt: 0 } }, employee: { status: { in: ["ACTIVE", "PROBATION", "NOTICE"] } } },
    include: { leaveType: true },
  });
  let carried = 0;
  for (const b of balances) {
    const unused = Math.max(0, b.entitled + b.carriedForward + b.adjustment - b.taken - b.pending);
    const cf = Math.min(unused, b.leaveType.carryForwardMax);
    await initLeaveBalances(ctx.tenantId, b.employeeId, toYear);
    await prisma.leaveBalance.update({
      where: { employeeId_leaveTypeId_year: { employeeId: b.employeeId, leaveTypeId: b.leaveTypeId, year: toYear } },
      data: { carriedForward: cf },
    });
    if (cf > 0) carried++;
  }
  await audit(ctx, "UPDATE", "LeaveBalance", null, `Carried forward ${fromYear} → ${toYear} for ${carried} balances`);
  return carried;
}

/** Unused annual leave (for encashment on separation), pro-rated to the last working day. */
export async function unusedAnnualLeave(tenantId: string, employeeId: string, lastDay: Date) {
  const al = await prisma.leaveType.findFirst({ where: { tenantId, code: "AL" } });
  if (!al) return 0;
  const emp = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
  const year = lastDay.getUTCFullYear();
  const bal = await getBalance(employeeId, al.id, year, tenantId);
  const prorated = computeEntitlement(al, { ...emp, lastWorkingDate: lastDay }, year);
  return Math.max(0, round2(prorated + bal.carriedForward + bal.adjustment - bal.taken - bal.pending));
}
