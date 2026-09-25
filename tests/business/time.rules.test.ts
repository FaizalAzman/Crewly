import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { clockIn, clockOut, manualAttendance, requestOvertime, decideOvertime, assignShift } from "@/server/services/time.service";
import { addDays, todayMY } from "@/lib/utils";
import { D, makeWorld, type World } from "./factory";

let w: World;
let branchId: string;
beforeAll(async () => {
  w = await makeWorld({ withBranchGeofence: true });
  branchId = (await prisma.branch.findFirstOrThrow({ where: { tenantId: w.tenantId } })).id;
});

/** A Malaysia-time instant on today's date. */
const at = (hh: number, mm: number) => new Date(todayMY().getTime() + (hh - 8) * 3600000 + mm * 60000);

describe("Clock in / out", () => {
  it("records on-time clock-in inside the geofence", async () => {
    const e = await w.emp({ branchId }, { login: "EMPLOYEE" });
    const r = await clockIn(e.ctx!, { lat: 3.1107, lng: 101.6654, now: at(8, 55) });
    expect(r).toMatchObject({ status: "PRESENT", lateMinutes: 0, withinFence: true });
  });

  it("applies the grace period before marking late", async () => {
    const a = await w.emp({ branchId }, { login: "EMPLOYEE" });
    expect((await clockIn(a.ctx!, { lat: 3.1106, lng: 101.6653, now: at(9, 9) })).status).toBe("PRESENT");
    const b = await w.emp({ branchId }, { login: "EMPLOYEE" });
    const late = await clockIn(b.ctx!, { lat: 3.1106, lng: 101.6653, now: at(9, 25) });
    expect(late).toMatchObject({ status: "LATE", lateMinutes: 25 });
  });

  it("flags (but accepts) clock-ins outside the geofence or without location", async () => {
    const far = await w.emp({ branchId }, { login: "EMPLOYEE" });
    const r = await clockIn(far.ctx!, { lat: 3.2, lng: 101.7, now: at(9, 0) });
    expect(r.withinFence).toBe(false);
    expect(r.note).toMatch(/m from HQ/);
    const noGps = await w.emp({ branchId }, { login: "EMPLOYEE" });
    const r2 = await clockIn(noGps.ctx!, { now: at(9, 0) });
    expect(r2).toMatchObject({ withinFence: false, note: "No location shared" });
  });

  it("prevents double clock-in and clock-out before clock-in", async () => {
    const e = await w.emp({ branchId }, { login: "EMPLOYEE" });
    await expect(clockOut(e.ctx!, { now: at(18, 0) })).rejects.toThrow(/haven't clocked in/);
    await clockIn(e.ctx!, { lat: 3.1106, lng: 101.6653, now: at(9, 0) });
    await expect(clockIn(e.ctx!, { lat: 3.1106, lng: 101.6653, now: at(9, 5) })).rejects.toThrow(/already clocked in/);
  });

  it("computes worked minutes net of the shift break", async () => {
    const e = await w.emp({ branchId }, { login: "EMPLOYEE" });
    await clockIn(e.ctx!, { lat: 3.1106, lng: 101.6653, now: at(9, 0) });
    const r = await clockOut(e.ctx!, { now: at(18, 30) });
    expect(r.workedMinutes).toBe(9 * 60 + 30 - 60);
    await expect(clockOut(e.ctx!, { now: at(19, 0) })).rejects.toThrow(/already clocked out/);
  });

  it("employees can't clock in for others; HR can", async () => {
    const e = await w.emp({ branchId });
    await expect(clockIn(w.employee, { employeeId: e.id, now: at(9, 0) })).rejects.toThrow(/permission/);
    expect((await clockIn(w.hr, { employeeId: e.id, lat: 3.1106, lng: 101.6653, now: at(9, 0) })).status).toBe("PRESENT");
  });

  it("uses the rostered shift for lateness", async () => {
    const e = await w.emp({ branchId }, { login: "EMPLOYEE" });
    const aft = await prisma.shift.findFirstOrThrow({ where: { tenantId: w.tenantId, code: "AFT" } });
    await assignShift(w.hr, { employeeId: e.id, date: todayMY(), shiftId: aft.id, dayType: "WORK" });
    const r = await clockIn(e.ctx!, { lat: 3.1106, lng: 101.6653, now: at(13, 55) });
    expect(r.status).toBe("PRESENT");
  });

  it("manual edits need a reason and valid times, and are audited", async () => {
    const e = await w.emp();
    const d = addDays(todayMY(), -2);
    await expect(manualAttendance(w.hr, { employeeId: e.id, date: d, clockIn: null, clockOut: null, status: "ABSENT", note: "" })).rejects.toThrow(/note/);
    await expect(manualAttendance(w.hr, { employeeId: e.id, date: d, clockIn: at(18, 0), clockOut: at(9, 0), status: "PRESENT", note: "x" })).rejects.toThrow(/after/);
    const r = await manualAttendance(w.hr, { employeeId: e.id, date: d, clockIn: at(9, 0), clockOut: at(18, 0), status: "PRESENT", note: "Forgot to clock" });
    expect(r.source).toBe("MANUAL");
    expect(await prisma.auditLog.count({ where: { tenantId: w.tenantId, entity: "Attendance", entityId: r.id } })).toBe(1);
  });
});

describe("Overtime (EA s.60A)", () => {
  it("detects the day type and applies 1.5× / 2× / 3×", async () => {
    const e = await w.emp({ basicSalary: 2600 });
    const normal = await requestOvertime(w.hr, { employeeId: e.id, date: D("2026-09-01"), hours: 2 });
    expect(normal).toMatchObject({ dayType: "NORMAL", multiplier: 1.5, amount: 37.5 });
    const rest = await requestOvertime(w.hr, { employeeId: e.id, date: D("2026-09-06"), hours: 2, normalHours: 8 }); // Sunday
    expect(rest).toMatchObject({ dayType: "REST_DAY", multiplier: 2, amount: 100 + 50 });
    const ph = await requestOvertime(w.hr, { employeeId: e.id, date: D("2026-08-31"), hours: 1, normalHours: 8 }); // National Day
    expect(ph).toMatchObject({ dayType: "PUBLIC_HOLIDAY", multiplier: 3, amount: 200 + 37.5 });
  });

  it("normal hours can only be claimed on rest days / public holidays", async () => {
    const e = await w.emp();
    await expect(requestOvertime(w.hr, { employeeId: e.id, date: D("2026-09-02"), hours: 1, normalHours: 4 })).rejects.toThrow(/rest days and public holidays/);
  });

  it("rejects future dates, > 12h/day and duplicates", async () => {
    const e = await w.emp();
    await expect(requestOvertime(w.hr, { employeeId: e.id, date: addDays(todayMY(), 3), hours: 2 })).rejects.toThrow(/already worked/);
    await expect(requestOvertime(w.hr, { employeeId: e.id, date: D("2026-09-03"), hours: 13 })).rejects.toThrow(/12/);
    await requestOvertime(w.hr, { employeeId: e.id, date: D("2026-09-03"), hours: 2 });
    await expect(requestOvertime(w.hr, { employeeId: e.id, date: D("2026-09-03"), hours: 1 })).rejects.toThrow(/already an OT/);
  });

  it("enforces the 104-hour monthly limit", async () => {
    const e = await w.emp();
    const days = ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10"];
    for (const d of days) await requestOvertime(w.hr, { employeeId: e.id, date: D(d), hours: 12 }); // 96h
    await requestOvertime(w.hr, { employeeId: e.id, date: D("2026-07-13"), hours: 8 }); // 104h
    await expect(requestOvertime(w.hr, { employeeId: e.id, date: D("2026-07-14"), hours: 0.5 })).rejects.toThrow(/104-hour/);
  });

  it("rejected OT doesn't count toward the cap and can't be decided twice", async () => {
    const e = await w.emp();
    const r = await requestOvertime(w.hr, { employeeId: e.id, date: D("2026-06-01"), hours: 12 });
    await decideOvertime(w.hr, r.id, false);
    await expect(decideOvertime(w.hr, r.id, true)).rejects.toThrow(/Already/);
  });

  it("uses the employee's normal hours for the hourly rate", async () => {
    const e = await w.emp({ basicSalary: 2600, workHoursPerDay: 10 });
    const r = await requestOvertime(w.hr, { employeeId: e.id, date: D("2026-09-04"), hours: 1 });
    expect(r.amount).toBe(15); // (2600/26/10) × 1.5
  });
});

describe("Roster", () => {
  it("working days need a shift", async () => {
    const e = await w.emp();
    await expect(assignShift(w.hr, { employeeId: e.id, date: D("2026-10-05"), shiftId: null, dayType: "WORK" })).rejects.toThrow(/shift/);
    const r = await assignShift(w.hr, { employeeId: e.id, date: D("2026-10-11"), shiftId: null, dayType: "REST" });
    expect(r.dayType).toBe("REST");
  });
});
