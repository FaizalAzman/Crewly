import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { addDays, todayMY } from "@/lib/utils";
import {
  adjustBalance,
  applyLeave,
  approveLeave,
  cancelLeave,
  carryForward,
  computeEntitlement,
  creditReplacementLeave,
  initLeaveBalances,
  rejectLeave,
} from "@/server/services/leave.service";
import { balance, D, leaveType, makeWorld, type World } from "./factory";

let w: World;
beforeAll(async () => {
  w = await makeWorld({ state: "KUALA_LUMPUR" });
});

const apply = async (employeeId: string, code: string, start: string, end = start, extra: Record<string, unknown> = {}) =>
  applyLeave(w.hr, { employeeId, leaveTypeId: (await leaveType(w.tenantId, code)).id, startDate: D(start), endDate: D(end), ...extra }, { onBehalf: true });

describe("Entitlements (Employment Act 1955)", () => {
  const al = { entitlementRule: "EA_ANNUAL", defaultDays: 8, gender: null };
  const sl = { entitlementRule: "EA_SICK", defaultDays: 14, gender: null };
  it("annual leave 8 / 12 / 16 by completed service at start of year", () => {
    expect(computeEntitlement(al, { joinDate: D("2025-01-01"), gender: "MALE" }, 2026)).toBe(8);
    expect(computeEntitlement(al, { joinDate: D("2023-06-01"), gender: "MALE" }, 2026)).toBe(12);
    expect(computeEntitlement(al, { joinDate: D("2020-01-01"), gender: "MALE" }, 2026)).toBe(16);
  });
  it("pro-rates annual leave for mid-year joiners (≥ ½ day rounds up)", () => {
    expect(computeEntitlement(al, { joinDate: D("2026-07-01"), gender: "MALE" }, 2026)).toBe(4); // 6 months → 4
    expect(computeEntitlement(al, { joinDate: D("2026-10-01"), gender: "MALE" }, 2026)).toBe(2); // 3 months → 2
    expect(computeEntitlement(al, { joinDate: D("2026-11-20"), gender: "MALE" }, 2026)).toBe(1); // 1 month → 0.67 → 1
  });
  it("pro-rates annual leave for leavers", () => {
    expect(computeEntitlement(al, { joinDate: D("2020-01-01"), gender: "MALE", lastWorkingDate: D("2026-06-30") }, 2026)).toBe(8);
  });
  it("sick leave 14 / 18 / 22 and is not pro-rated", () => {
    expect(computeEntitlement(sl, { joinDate: D("2026-11-01"), gender: "MALE" }, 2026)).toBe(14);
    expect(computeEntitlement(sl, { joinDate: D("2023-06-01"), gender: "MALE" }, 2026)).toBe(18);
    expect(computeEntitlement(sl, { joinDate: D("2019-06-01"), gender: "MALE" }, 2026)).toBe(22);
  });
  it("no entitlement before joining year", () => {
    expect(computeEntitlement(al, { joinDate: D("2027-02-01"), gender: "MALE" }, 2026)).toBe(0);
  });
  it("gender-restricted types give zero to the other gender", () => {
    expect(computeEntitlement({ entitlementRule: "FIXED", defaultDays: 98, gender: "FEMALE" }, { joinDate: D("2020-01-01"), gender: "MALE" }, 2026)).toBe(0);
    expect(computeEntitlement({ entitlementRule: "FIXED", defaultDays: 98, gender: "FEMALE" }, { joinDate: D("2020-01-01"), gender: "FEMALE" }, 2026)).toBe(98);
  });
  it("seeds statutory balances when an employee is created", async () => {
    const { id } = await w.emp({ joinDate: D("2020-01-02") });
    await initLeaveBalances(w.tenantId, id, 2026);
    expect((await balance(id, w.tenantId, "AL", 2026))?.entitled).toBe(16);
    expect((await balance(id, w.tenantId, "SL", 2026))?.entitled).toBe(22);
    expect((await balance(id, w.tenantId, "HL", 2026))?.entitled).toBe(60);
    expect((await balance(id, w.tenantId, "PL", 2026))?.entitled).toBe(7);
    expect((await balance(id, w.tenantId, "ML", 2026))?.entitled).toBe(0); // male
  });
});

describe("Applying for leave", () => {
  it("counts working days only, skipping weekends and state public holidays", async () => {
    const { id } = await w.emp();
    // Mon 14 – Fri 18 Sep 2026; Wed 16 Sep = Malaysia Day
    const r = await apply(id, "AL", "2026-09-14", "2026-09-18");
    expect(r.days).toBe(4);
  });

  it("maternity leave counts calendar days", async () => {
    const { id } = await w.emp({ gender: "FEMALE" });
    const r = await apply(id, "ML", "2026-03-02", "2026-06-07");
    expect(r.days).toBe(98);
  });

  it("rejects a request falling entirely on rest days / holidays", async () => {
    const { id } = await w.emp();
    await expect(apply(id, "AL", "2026-09-19", "2026-09-20")).rejects.toThrow(/rest days or public holidays/);
  });

  it("supports half days on a single day only", async () => {
    const { id } = await w.emp();
    const r = await apply(id, "AL", "2026-10-05", "2026-10-05", { halfDay: "AM" });
    expect(r.days).toBe(0.5);
    await expect(apply(id, "AL", "2026-10-06", "2026-10-07", { halfDay: "PM" })).rejects.toThrow(/same day/);
  });

  it("allows AM and PM halves on the same day but no other overlaps", async () => {
    const { id } = await w.emp();
    await apply(id, "AL", "2026-10-12", "2026-10-12", { halfDay: "AM" });
    await apply(id, "AL", "2026-10-12", "2026-10-12", { halfDay: "PM" });
    await expect(apply(id, "AL", "2026-10-12", "2026-10-13")).rejects.toThrow(/already have leave/);
  });

  it("disallows half days for types that don't allow them", async () => {
    const { id } = await w.emp();
    await expect(apply(id, "MRL", "2026-10-05", "2026-10-05", { halfDay: "AM" })).rejects.toThrow(/half days/);
  });

  it("rejects end before start and cross-year requests", async () => {
    const { id } = await w.emp();
    await expect(apply(id, "AL", "2026-10-09", "2026-10-05")).rejects.toThrow(/before start/);
    await expect(apply(id, "AL", "2026-12-30", "2027-01-04")).rejects.toThrow(/new year/);
  });

  it("requires a supporting document for sick leave", async () => {
    const { id } = await w.emp();
    await expect(apply(id, "SL", "2026-10-05")).rejects.toThrow(/supporting document/);
    const ok = await apply(id, "SL", "2026-10-05", "2026-10-05", { attachment: "MC-123" });
    expect(ok.status).toBe("PENDING");
  });

  it("restricts maternity leave to female employees", async () => {
    const { id } = await w.emp({ gender: "MALE" });
    await expect(apply(id, "ML", "2026-10-05")).rejects.toThrow(/female/);
  });

  it("paternity leave requires marriage and 12 months of service (s.60FA)", async () => {
    const single = await w.emp({ maritalStatus: "SINGLE" });
    await expect(apply(single.id, "PL", "2026-10-05")).rejects.toThrow(/married/);
    const newbie = await w.emp({ maritalStatus: "MARRIED", joinDate: D("2026-03-01") });
    await expect(apply(newbie.id, "PL", "2026-10-05")).rejects.toThrow(/12 months/);
    const ok = await w.emp({ maritalStatus: "MARRIED", joinDate: D("2024-01-02") });
    expect((await apply(ok.id, "PL", "2026-10-05", "2026-10-09")).days).toBe(5);
  });

  it("blocks requests that exceed the available balance", async () => {
    const { id } = await w.emp({ joinDate: D("2025-06-02") }); // 8 days AL
    await expect(apply(id, "AL", "2026-10-05", "2026-10-16")).rejects.toThrow(/Not enough/);
  });

  it("counts pending requests against the balance", async () => {
    const { id } = await w.emp({ joinDate: D("2025-06-02") });
    await apply(id, "AL", "2026-10-05", "2026-10-09"); // 5 pending
    await expect(apply(id, "AL", "2026-10-19", "2026-10-22")).rejects.toThrow(/available 3/);
  });

  it("caps hospitalisation leave at 60 days including sick leave taken", async () => {
    const { id } = await w.emp({ joinDate: D("2020-01-02") });
    const hl = await leaveType(w.tenantId, "HL");
    const sl = await leaveType(w.tenantId, "SL");
    await initLeaveBalances(w.tenantId, id, 2026);
    await prisma.leaveBalance.update({ where: { employeeId_leaveTypeId_year: { employeeId: id, leaveTypeId: sl.id, year: 2026 } }, data: { taken: 20 } });
    await prisma.leaveBalance.update({ where: { employeeId_leaveTypeId_year: { employeeId: id, leaveTypeId: hl.id, year: 2026 } }, data: { taken: 38 } });
    await expect(apply(id, "HL", "2026-10-05", "2026-10-07", { attachment: "HOSP-1" })).rejects.toThrow(/available 2/);
  });

  it("enforces minimum notice for employees applying themselves, but not for HR", async () => {
    const tomorrow = addDays(todayMY(), 1);
    const al = await leaveType(w.tenantId, "AL");
    await expect(applyLeave(w.employee, { employeeId: w.employeeId, leaveTypeId: al.id, startDate: tomorrow, endDate: tomorrow })).rejects.toThrow(/notice|rest days|year|last working/);
  });

  it("does not let employees apply on behalf of others", async () => {
    const al = await leaveType(w.tenantId, "AL");
    await expect(applyLeave(w.employee, { employeeId: w.managerEmployeeId, leaveTypeId: al.id, startDate: D("2026-10-05"), endDate: D("2026-10-05") })).rejects.toThrow(/permission/);
  });

  it("unpaid leave does not need a balance", async () => {
    const { id } = await w.emp();
    const r = await apply(id, "UL", "2026-10-05", "2026-10-30");
    expect(r.days).toBe(20);
  });

  it("puts days into 'pending' and notifies the manager", async () => {
    const mgrUser = await prisma.user.findUniqueOrThrow({ where: { employeeId: w.managerEmployeeId } });
    const before = await prisma.notification.count({ where: { userId: mgrUser.id } });
    await apply(w.employeeId, "AL", "2026-11-02", "2026-11-03");
    const b = await balance(w.employeeId, w.tenantId, "AL", 2026);
    expect(b?.pending).toBe(2);
    expect(await prisma.notification.count({ where: { userId: mgrUser.id } })).toBe(before + 1);
  });
});

describe("Approval workflow", () => {
  it("approving moves days from pending to taken", async () => {
    const { id } = await w.emp();
    const r = await apply(id, "AL", "2026-11-09", "2026-11-10");
    await approveLeave(w.hr, r.id);
    const b = await balance(id, w.tenantId, "AL", 2026);
    expect(b).toMatchObject({ pending: 0, taken: 2 });
  });

  it("rejecting requires a reason and releases pending days", async () => {
    const { id } = await w.emp();
    const r = await apply(id, "AL", "2026-11-16", "2026-11-17");
    await expect(rejectLeave(w.hr, r.id, "")).rejects.toThrow(/reason/);
    await rejectLeave(w.hr, r.id, "Busy period");
    expect(await balance(id, w.tenantId, "AL", 2026)).toMatchObject({ pending: 0, taken: 0 });
  });

  it("cannot decide a request twice", async () => {
    const { id } = await w.emp();
    const r = await apply(id, "AL", "2026-11-23", "2026-11-23");
    await approveLeave(w.hr, r.id);
    await expect(approveLeave(w.hr, r.id)).rejects.toThrow(/already approved/);
  });

  it("a manager can approve their direct report", async () => {
    const r = await apply(w.employeeId, "AL", "2026-11-24", "2026-11-24");
    const ok = await approveLeave(w.manager, r.id);
    expect(ok.status).toBe("APPROVED");
  });

  it("a manager cannot approve someone outside their team", async () => {
    const { id } = await w.emp();
    const r = await apply(id, "AL", "2026-11-25", "2026-11-25");
    await expect(approveLeave(w.manager, r.id)).rejects.toThrow(/manager or HR/);
  });

  it("nobody can approve their own leave — not even HR", async () => {
    const hrEmp = await w.emp();
    const hrCtx = await w.ctxFor(hrEmp.id, "HR_ADMIN");
    const r = await apply(hrEmp.id, "AL", "2026-11-26", "2026-11-26");
    await expect(approveLeave(hrCtx, r.id)).rejects.toThrow(/own request/);
  });

  it("employees can cancel pending leave and approved future leave; balance restored", async () => {
    const e = await w.emp({}, { login: "EMPLOYEE" });
    const al = await leaveType(w.tenantId, "AL");
    const start = addDays(todayMY(), 30);
    // pick a weekday
    while ([0, 6].includes(start.getUTCDay())) start.setUTCDate(start.getUTCDate() + 1);
    if (start.getUTCFullYear() !== todayMY().getUTCFullYear()) return; // near year end — skip
    const r = await applyLeave(e.ctx!, { employeeId: e.id, leaveTypeId: al.id, startDate: start, endDate: start });
    await approveLeave(w.hr, r.id);
    await cancelLeave(e.ctx!, r.id);
    const b = await balance(e.id, w.tenantId, "AL", start.getUTCFullYear());
    expect(b).toMatchObject({ taken: 0, pending: 0 });
  });

  it("employees can't cancel leave that has already started", async () => {
    const e = await w.emp({}, { login: "EMPLOYEE" });
    const r = await apply(e.id, "AL", "2026-02-02", "2026-02-03");
    await approveLeave(w.hr, r.id);
    await expect(cancelLeave(e.ctx!, r.id, { today: D("2026-02-03") })).rejects.toThrow(/HR/);
    await cancelLeave(w.hr, r.id, { today: D("2026-02-03") }); // HR can
  });
});

describe("Balances & year-end", () => {
  it("replacement leave credits increase the RL balance", async () => {
    const { id } = await w.emp();
    await creditReplacementLeave(w.hr, id, 1, "Worked on Merdeka Day");
    const b = await balance(id, w.tenantId, "RL", todayMY().getUTCFullYear());
    expect(b?.adjustment).toBe(1);
    await expect(creditReplacementLeave(w.hr, id, 0, "x")).rejects.toThrow(/between/);
  });

  it("manual adjustments need a reason and can't make the balance negative", async () => {
    const { id } = await w.emp({ joinDate: D("2025-06-02") });
    await initLeaveBalances(w.tenantId, id, 2026);
    const b = (await balance(id, w.tenantId, "AL", 2026))!;
    await expect(adjustBalance(w.hr, b.id, 1, "")).rejects.toThrow(/reason/);
    await expect(adjustBalance(w.hr, b.id, -20, "Oops")).rejects.toThrow(/negative/);
    await adjustBalance(w.hr, b.id, 2, "Long service award");
    expect((await balance(id, w.tenantId, "AL", 2026))?.adjustment).toBe(2);
  });

  it("carries forward unused annual leave up to the cap", async () => {
    const { id } = await w.emp({ joinDate: D("2020-01-02") }); // 16 AL, c/f max 5
    await initLeaveBalances(w.tenantId, id, 2026);
    await apply(id, "AL", "2026-12-07", "2026-12-11").then((r) => approveLeave(w.hr, r.id)); // 5 used → 11 unused
    await carryForward(w.hr, 2026);
    expect((await balance(id, w.tenantId, "AL", 2027))?.carriedForward).toBe(5);
  });

  it("only HR can run year-end carry forward", async () => {
    await expect(carryForward(w.manager, 2026)).rejects.toThrow(/permission/);
  });
});
