import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  addAdjustment,
  approvePayrollRun,
  calculatePayrollRun,
  createPayrollRun,
  deletePayrollRun,
  lockPayrollRun,
  markPayrollPaid,
  reopenPayrollRun,
  yearToDate,
} from "@/server/services/payroll.service";
import { decideClaim, decideLoan, requestLoan, submitClaim } from "@/server/services/money.service";
import { applyLeave, approveLeave } from "@/server/services/leave.service";
import { decideOvertime, requestOvertime } from "@/server/services/time.service";
import { D, leaveType, makeWorld, nric, type World } from "./factory";
import { addDays, periodOf, todayMY } from "@/lib/utils";

/** Each describe gets its own tenant so runs/periods never collide. */
async function world() {
  return makeWorld({ state: "KUALA_LUMPUR" });
}

async function run(w: World, period: string, opts: { approve?: boolean; pay?: boolean } = {}) {
  const r = await createPayrollRun(w.payroll, { companyId: w.companyId, period, payDate: D(`${period}-28`) });
  await calculatePayrollRun(w.payroll, r.id);
  if (opts.approve || opts.pay) await approvePayrollRun(w.hr, r.id);
  if (opts.pay) await markPayrollPaid(w.hr, r.id);
  return r;
}

const slipOf = (runId: string, employeeId: string) =>
  prisma.payslip.findUniqueOrThrow({ where: { runId_employeeId: { runId, employeeId } }, include: { lines: true } });

describe("Run workflow", () => {
  let w: World;
  beforeAll(async () => {
    w = await world();
  });

  it("validates the period format and uniqueness per entity", async () => {
    await expect(createPayrollRun(w.payroll, { companyId: w.companyId, period: "2026-13", payDate: D("2026-01-28") })).rejects.toThrow(/YYYY-MM/);
    await createPayrollRun(w.payroll, { companyId: w.companyId, period: "2026-01", payDate: D("2026-01-28") });
    await expect(createPayrollRun(w.payroll, { companyId: w.companyId, period: "2026-01", payDate: D("2026-01-28") })).rejects.toThrow(/already exists/);
  });

  it("rejects a pay date before the period starts", async () => {
    await expect(createPayrollRun(w.payroll, { companyId: w.companyId, period: "2026-02", payDate: D("2026-01-28") })).rejects.toThrow(/Pay date/);
  });

  it("calculates payslips for every employee employed in the period", async () => {
    const r = await prisma.payrollRun.findFirstOrThrow({ where: { companyId: w.companyId, period: "2026-01" } });
    const { run: calc } = await calculatePayrollRun(w.payroll, r.id);
    expect(calc.status).toBe("CALCULATED");
    expect(calc.headcount).toBe(2);
    expect(calc.totalNet).toBeGreaterThan(0);
  });

  it("maker-checker: the preparer cannot approve", async () => {
    const r = await prisma.payrollRun.findFirstOrThrow({ where: { companyId: w.companyId, period: "2026-01" } });
    await expect(approvePayrollRun(w.payroll, r.id)).rejects.toThrow(/Maker-checker/);
  });

  it("managers and employees cannot run or approve payroll", async () => {
    const r = await prisma.payrollRun.findFirstOrThrow({ where: { companyId: w.companyId, period: "2026-01" } });
    await expect(calculatePayrollRun(w.manager, r.id)).rejects.toThrow(/permission/);
    await expect(approvePayrollRun(w.employee, r.id)).rejects.toThrow(/permission/);
  });

  it("requires the previous month to be finalised before approval", async () => {
    const feb = await run(w, "2026-02");
    await expect(approvePayrollRun(w.hr, feb.id)).rejects.toThrow(/Finalise 2026-01/);
  });

  it("walks the full lifecycle: approve → paid → locked", async () => {
    const jan = await prisma.payrollRun.findFirstOrThrow({ where: { companyId: w.companyId, period: "2026-01" } });
    await approvePayrollRun(w.hr, jan.id);
    await expect(calculatePayrollRun(w.payroll, jan.id)).rejects.toThrow(/recalculate/);
    await expect(lockPayrollRun(w.hr, jan.id)).rejects.toThrow(/paid/);
    await markPayrollPaid(w.hr, jan.id);
    await lockPayrollRun(w.hr, jan.id);
    expect((await prisma.payrollRun.findUniqueOrThrow({ where: { id: jan.id } })).status).toBe("LOCKED");
  });

  it("only draft/calculated runs can be deleted", async () => {
    const jan = await prisma.payrollRun.findFirstOrThrow({ where: { companyId: w.companyId, period: "2026-01" } });
    await expect(deletePayrollRun(w.payroll, jan.id)).rejects.toThrow(/draft or calculated/);
    const feb = await prisma.payrollRun.findFirstOrThrow({ where: { companyId: w.companyId, period: "2026-02" } });
    await deletePayrollRun(w.payroll, feb.id);
    expect(await prisma.payrollRun.findUnique({ where: { id: feb.id } })).toBeNull();
  });

  it("can't create a period earlier than a finalised later one", async () => {
    await expect(createPayrollRun(w.payroll, { companyId: w.companyId, period: "2025-12", payDate: D("2025-12-28") })).rejects.toThrow(/later period/);
  });

  it("reopen is blocked once a later period is finalised", async () => {
    const feb = await run(w, "2026-02", { approve: true });
    const reopened = await reopenPayrollRun(w.hr, feb.id);
    expect(reopened.status).toBe("CALCULATED");
    await approvePayrollRun(w.hr, feb.id);
    await markPayrollPaid(w.hr, feb.id);
    await run(w, "2026-03", { pay: true });
    await expect(reopenPayrollRun(w.hr, feb.id)).rejects.toThrow(/approved/);
  });

  it("one-off adjustments are refused for finalised periods and for system items", async () => {
    const bonus = await prisma.payItem.findFirstOrThrow({ where: { tenantId: w.tenantId, code: "BONUS" } });
    const loan = await prisma.payItem.findFirstOrThrow({ where: { tenantId: w.tenantId, code: "LOAN" } });
    await expect(addAdjustment(w.payroll, { employeeId: w.employeeId, payItemId: bonus.id, period: "2026-01", amount: 100 })).rejects.toThrow(/locked|already/);
    await expect(addAdjustment(w.payroll, { employeeId: w.employeeId, payItemId: loan.id, period: "2026-04", amount: 100 })).rejects.toThrow(/automatically/);
    await expect(addAdjustment(w.payroll, { employeeId: w.employeeId, payItemId: bonus.id, period: "2026-04", amount: 0 })).rejects.toThrow(/zero/);
  });
});

describe("Payslip calculations", () => {
  let w: World;
  beforeAll(async () => {
    w = await world();
  });

  it("standard RM5,000 employee: EPF 11%/13%, SOCSO, EIS, PCB & net pay reconcile", async () => {
    const e = await w.emp({ basicSalary: 5000, maritalStatus: "SINGLE" });
    const r = await run(w, "2026-01");
    const s = await slipOf(r.id, e.id);
    expect(s.grossPay).toBe(5000);
    expect(s.epfEE).toBe(550);
    expect(s.epfER).toBe(650);
    expect(s.socsoEE).toBe(24.75);
    expect(s.socsoER).toBe(86.65);
    expect(s.eisEE).toBe(9.9);
    expect(s.pcb).toBeGreaterThan(90);
    expect(s.pcb).toBeLessThan(115);
    expect(s.netPay).toBeCloseTo(s.grossPay - s.epfEE - s.socsoEE - s.eisEE - s.pcb, 2);
    expect(s.employerCost).toBeCloseTo(5000 + 650 + 86.65 + 9.9 + s.hrdf, 2);
    expect(s.lines.map((l) => l.code)).toEqual(expect.arrayContaining(["BASIC", "EPF_EE", "SOCSO_EE", "EIS_EE", "PCB", "EPF_ER", "SOCSO_ER", "EIS_ER"]));
  });

  it("pro-rates basic salary for a mid-month joiner (working-day basis)", async () => {
    const e = await w.emp({ basicSalary: 4400, joinDate: D("2026-02-16") }); // Feb 2026: 20 working days (CNY 17–18 excluded); joined for 10
    await prisma.payrollRun.deleteMany({ where: { companyId: w.companyId, period: "2026-02" } });
    const r = await run(w, "2026-02");
    const s = await slipOf(r.id, e.id);
    expect(s.workingDays).toBe(18);
    expect(s.daysPaid).toBe(8);
    expect(s.proratedBasic).toBeCloseTo((4400 * 8) / 18, 2);
  });

  it("excludes employees who joined after the period", async () => {
    const e = await w.emp({ joinDate: D("2026-03-02") });
    const r = await prisma.payrollRun.findFirstOrThrow({ where: { companyId: w.companyId, period: "2026-02" } });
    await calculatePayrollRun(w.payroll, r.id);
    expect(await prisma.payslip.findUnique({ where: { runId_employeeId: { runId: r.id, employeeId: e.id } } })).toBeNull();
  });

  it("deducts approved unpaid leave by working days", async () => {
    const e = await w.emp({ basicSalary: 4200 });
    const ul = await leaveType(w.tenantId, "UL");
    const req = await applyLeave(w.hr, { employeeId: e.id, leaveTypeId: ul.id, startDate: D("2026-03-09"), endDate: D("2026-03-10") }, { onBehalf: true });
    await approveLeave(w.hr, req.id);
    const r = await run(w, "2026-03");
    const s = await slipOf(r.id, e.id);
    expect(s.unpaidLeaveDays).toBe(2);
    expect(s.unpaidLeaveDeduction).toBeCloseTo((4200 / s.workingDays) * 2, 2);
    expect(s.grossPay).toBeCloseTo(4200 - s.unpaidLeaveDeduction, 2);
    expect(s.lines.find((l) => l.code === "UNPAID")?.amount).toBeCloseTo(-s.unpaidLeaveDeduction, 2);
  });

  it("bonus is taxed as additional remuneration and attracts EPF but not SOCSO", async () => {
    const e = await w.emp({ basicSalary: 6000, maritalStatus: "SINGLE" });
    const bonus = await prisma.payItem.findFirstOrThrow({ where: { tenantId: w.tenantId, code: "BONUS" } });
    await addAdjustment(w.payroll, { employeeId: e.id, payItemId: bonus.id, period: "2026-04", amount: 6000, note: "Annual bonus" });
    const r = await run(w, "2026-04");
    const s = await slipOf(r.id, e.id);
    expect(s.grossPay).toBe(12000);
    expect(s.epfWages).toBe(12000);
    expect(s.socsoWages).toBe(6000);
    expect(s.pcbAdditional).toBeGreaterThan(0);
    expect(s.pcbYt).toBe(6000);
  });

  it("includes approved overtime (subject to SOCSO but not EPF) and marks it paid", async () => {
    const e = await w.emp({ basicSalary: 2600, workHoursPerDay: 8 });
    const ot = await requestOvertime(w.hr, { employeeId: e.id, date: D("2026-05-06"), hours: 4 });
    await decideOvertime(w.hr, ot.id, true);
    const r = await run(w, "2026-05", { pay: false });
    const s = await slipOf(r.id, e.id);
    expect(s.lines.find((l) => l.code === "OT")?.amount).toBe(75); // 4h × 12.50 × 1.5
    expect(s.epfWages).toBe(2600);
    expect(s.socsoWages).toBe(2675);
  });

  it("recovers loans in instalments, never beyond the balance, and settles them", async () => {
    const e = await w.emp({ basicSalary: 4000, joinDate: D("2020-01-02") });
    const loan = await requestLoan(w.hr, { employeeId: e.id, type: "STAFF_LOAN", principal: 1500, installment: 1000, startPeriod: "2026-07" });
    await decideLoan(w.hr, loan.id, true);
    await run(w, "2026-07", { pay: true });
    expect((await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } })).balance).toBe(500);
    const aug = await run(w, "2026-08", { pay: true });
    const s = await slipOf(aug.id, e.id);
    expect(s.lines.find((l) => l.code.startsWith("LOAN:"))?.amount).toBe(500);
    const after = await prisma.loan.findUniqueOrThrow({ where: { id: loan.id }, include: { repayments: true } });
    expect(after).toMatchObject({ balance: 0, status: "SETTLED" });
    expect(after.repayments).toHaveLength(2);
  });

  it("accumulates YTD (X) so PCB stays level month to month", async () => {
    const e = await w.emp({ basicSalary: 9000, maritalStatus: "SINGLE" });
    const sep = await run(w, "2026-09", { pay: true });
    const ytd = await yearToDate(e.id, "2026-10");
    const s = await slipOf(sep.id, e.id);
    expect(ytd.X).toBeGreaterThanOrEqual(s.pcb);
    expect(ytd.K).toBeGreaterThan(0);
  });

});

describe("Claims & zakat through payroll", () => {
  it("reimburses approved claims (non-taxable) and marks them paid on payment", async () => {
    const w = await world();
    const e = await w.emp();
    const type = await prisma.claimType.findFirstOrThrow({ where: { tenantId: w.tenantId, name: "Toll & Parking" } });
    const date = addDays(todayMY(), -3);
    const c = await submitClaim(w.hr, { employeeId: e.id, claimTypeId: type.id, date, amount: 45.5, description: "Tolls", receiptUrl: "r.jpg" });
    await decideClaim(w.hr, c.id, true);
    const r = await run(w, periodOf(date), { pay: true });
    const s = await slipOf(r.id, e.id);
    expect(s.lines.find((l) => l.code === "CLAIM")?.amount).toBe(45.5);
    expect(s.epfWages).toBe(5000);
    expect(s.grossPay).toBe(5045.5);
    expect((await prisma.claim.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("PAID");
  });

  it("zakat is deducted and offsets PCB ringgit for ringgit", async () => {
    const w = await world();
    const plain = await w.emp({ basicSalary: 8000, maritalStatus: "SINGLE" });
    const zakat = await w.emp({ basicSalary: 8000, maritalStatus: "SINGLE", zakatMonthly: 100 });
    const r = await run(w, "2026-01");
    const a = await slipOf(r.id, plain.id);
    const b = await slipOf(r.id, zakat.id);
    expect(a.pcb).toBeGreaterThan(100);
    expect(b.zakat).toBe(100);
    expect(a.pcb - b.pcb).toBeCloseTo(100, 1);
    expect(b.netPay).toBeCloseTo(a.netPay, 1);
  });
});

describe("Statutory edge cases in payroll", () => {
  let w: World;
  beforeAll(async () => {
    w = await world();
  });

  it("employee aged 60+: EPF 0%/4%, SOCSO category 2, no EIS", async () => {
    const e = await w.emp({ basicSalary: 3000, icNo: nric("650101") });
    const r = await run(w, "2026-01");
    const s = await slipOf(r.id, e.id);
    expect(s.epfEE).toBe(0);
    expect(s.epfER).toBe(120);
    expect(s.socsoEE).toBe(0);
    expect(s.socsoER).toBe(36.85);
    expect(s.eisEE).toBe(0);
  });

  it("foreign worker: EPF 2%/2%, SOCSO employer-only, no EIS, no HRD levy", async () => {
    const f = await w.emp({ basicSalary: 2000, citizenship: "FOREIGNER", passportNo: "NP123", icNo: null, dateOfBirth: D("1995-01-01") });
    const r = await prisma.payrollRun.findFirstOrThrow({ where: { companyId: w.companyId, period: "2026-01" } });
    await calculatePayrollRun(w.payroll, r.id);
    const s = await slipOf(r.id, f.id);
    expect(s).toMatchObject({ epfEE: 40, epfER: 40, socsoEE: 0, eisEE: 0, eisER: 0, hrdf: 0 });
    expect(s.socsoER).toBeGreaterThan(0);
  });

  it("non-resident is taxed at a flat 30%", async () => {
    const e = await w.emp({ basicSalary: 5000, taxResident: false });
    const r = await prisma.payrollRun.findFirstOrThrow({ where: { companyId: w.companyId, period: "2026-01" } });
    await calculatePayrollRun(w.payroll, r.id);
    expect((await slipOf(r.id, e.id)).pcb).toBe(1500);
  });

  it("HRD Corp levy applies only once there are 10+ Malaysian employees", async () => {
    const r = await prisma.payrollRun.findFirstOrThrow({ where: { companyId: w.companyId, period: "2026-01" } });
    let { run: calc } = await calculatePayrollRun(w.payroll, r.id);
    expect(calc.totalHrdf).toBe(0); // fewer than 10 citizens so far
    for (let i = 0; i < 8; i++) await w.emp({ basicSalary: 3000 });
    ({ run: calc } = await calculatePayrollRun(w.payroll, r.id));
    expect(calc.totalHrdf).toBeGreaterThan(0);
    const s = await prisma.payslip.findFirstOrThrow({ where: { runId: r.id, employee: { citizenship: "CITIZEN", basicSalary: 3000, zakatMonthly: 0, icNo: { not: { startsWith: "65" } } } } });
    expect(s.hrdf).toBe(30);
  });

  it("TP3 previous-employer income is included in PCB", async () => {
    const withTp3 = await w.emp({ basicSalary: 7000, maritalStatus: "SINGLE" });
    const without = await w.emp({ basicSalary: 7000, maritalStatus: "SINGLE" });
    await prisma.taxDeclaration.create({ data: { employeeId: withTp3.id, year: 2026, prevGross: 60000, prevEpf: 4000, prevPcb: 2000 } });
    const r = await prisma.payrollRun.findFirstOrThrow({ where: { companyId: w.companyId, period: "2026-01" } });
    await calculatePayrollRun(w.payroll, r.id);
    const a = await slipOf(r.id, withTp3.id);
    const b = await slipOf(r.id, without.id);
    expect(a.pcb).not.toBe(b.pcb);
    expect(a.epfEE).toBe(b.epfEE);
  });

  it("TP1 reliefs reduce PCB", async () => {
    const plain = await w.emp({ basicSalary: 10000, maritalStatus: "SINGLE" });
    const reliefs = await w.emp({ basicSalary: 10000, maritalStatus: "SINGLE" });
    await prisma.taxDeclaration.create({ data: { employeeId: reliefs.id, year: 2026, lifestyle: 2500, lifeInsurance: 3000, prs: 3000 } });
    const r = await prisma.payrollRun.findFirstOrThrow({ where: { companyId: w.companyId, period: "2026-01" } });
    await calculatePayrollRun(w.payroll, r.id);
    expect((await slipOf(r.id, reliefs.id)).pcb).toBeLessThan((await slipOf(r.id, plain.id)).pcb);
  });

  it("recalculating a run replaces payslips rather than duplicating", async () => {
    const r = await prisma.payrollRun.findFirstOrThrow({ where: { companyId: w.companyId, period: "2026-01" } });
    await calculatePayrollRun(w.payroll, r.id);
    const n1 = await prisma.payslip.count({ where: { runId: r.id } });
    await calculatePayrollRun(w.payroll, r.id);
    expect(await prisma.payslip.count({ where: { runId: r.id } })).toBe(n1);
  });

  it("run totals equal the sum of payslips", async () => {
    const r = await prisma.payrollRun.findFirstOrThrow({ where: { companyId: w.companyId, period: "2026-01" } });
    const slips = await prisma.payslip.findMany({ where: { runId: r.id } });
    const sum = (k: "netPay" | "epfEE" | "pcb") => Math.round(slips.reduce((a, s) => a + s[k], 0) * 100) / 100;
    expect(r.totalNet).toBeCloseTo(sum("netPay"), 2);
    expect(r.totalEpfEE).toBeCloseTo(sum("epfEE"), 2);
    expect(r.totalPcb).toBeCloseTo(sum("pcb"), 2);
  });

  it("payslips are only visible to the employee once the run is paid (notifications sent)", async () => {
    const r = await prisma.payrollRun.findFirstOrThrow({ where: { companyId: w.companyId, period: "2026-01" } });
    const user = await prisma.user.findUniqueOrThrow({ where: { employeeId: w.employeeId } });
    const before = await prisma.notification.count({ where: { userId: user.id } });
    await approvePayrollRun(w.hr, r.id);
    await markPayrollPaid(w.hr, r.id);
    expect(await prisma.notification.count({ where: { userId: user.id } })).toBe(before + 1);
  });
});
