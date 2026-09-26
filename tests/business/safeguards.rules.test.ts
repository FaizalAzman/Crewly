/**
 * Safeguards: payroll calculation lock, stale-run protection, collision-free reference numbers, the seat limit
 * under concurrency, session revocation, EA 1955 s.19 pay dates, negative net pay, and protected separations.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { addAdjustment, approvePayrollRun, calculatePayrollRun, createPayrollRun, removeAdjustment } from "@/server/services/payroll.service";
import { decideLoan, recordLoanRepayment, requestLoan } from "@/server/services/money.service";
import { openTicket } from "@/server/services/culture.service";
import { fileGrievance } from "@/server/services/relations.service";
import { createEmployee } from "@/server/services/employee.service";
import { logOutEverywhere, resetUserPassword, setUserActive } from "@/server/services/settings.service";
import { issueToken, resetPassword } from "@/server/services/auth.service";
import { createSeparation } from "@/server/services/lifecycle.service";
import { D, leaveType, makeWorld, nric, type World } from "./factory";

const payItem = (w: World, code: string) => prisma.payItem.findFirstOrThrow({ where: { tenantId: w.tenantId, code } });

describe("Payroll calculation lock & stale runs", () => {
  let w: World;
  beforeAll(async () => {
    w = await makeWorld();
  });

  it("two simultaneous calculations don't interleave", async () => {
    const run = await createPayrollRun(w.payroll, { companyId: w.companyId, period: "2026-05", payDate: D("2026-05-28") });
    const results = await Promise.allSettled([calculatePayrollRun(w.payroll, run.id), calculatePayrollRun(w.hr, run.id)]);
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    for (const f of failed) expect(String(f.reason)).toMatch(/already being calculated/);
    const after = await prisma.payrollRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(after.calculatingSince).toBeNull();
    expect(await prisma.payslip.count({ where: { runId: run.id } })).toBe(after.headcount);
    await approvePayrollRun(w.hr, run.id); // months are approved in order
  });

  it("an abandoned lock expires, and a run being calculated can't be approved", async () => {
    const run = await createPayrollRun(w.payroll, { companyId: w.companyId, period: "2026-06", payDate: D("2026-06-28") });
    await calculatePayrollRun(w.payroll, run.id);
    await prisma.payrollRun.update({ where: { id: run.id }, data: { calculatingSince: new Date() } });
    await expect(approvePayrollRun(w.hr, run.id)).rejects.toThrow(/being recalculated/);
    await prisma.payrollRun.update({ where: { id: run.id }, data: { calculatingSince: new Date(Date.now() - 11 * 60_000) } });
    await expect(calculatePayrollRun(w.payroll, run.id)).resolves.toBeTruthy();
    await approvePayrollRun(w.hr, run.id);
  });

  it("an adjustment added after calculation sends the run back to draft until it's recalculated", async () => {
    const run = await createPayrollRun(w.payroll, { companyId: w.companyId, period: "2026-07", payDate: D("2026-07-28") });
    await calculatePayrollRun(w.payroll, run.id);
    const bonus = await payItem(w, "BONUS");
    const { adjustment, recalculate } = await addAdjustment(w.payroll, { employeeId: w.employeeId, payItemId: bonus.id, period: "2026-07", amount: 300 });
    expect(recalculate).toEqual(["2026-07"]);
    await expect(approvePayrollRun(w.hr, run.id)).rejects.toThrow(/calculated runs/);
    await calculatePayrollRun(w.payroll, run.id);
    await approvePayrollRun(w.hr, run.id);
    // Once finalised, the adjustment is part of the paid record.
    await expect(removeAdjustment(w.payroll, adjustment.id)).rejects.toThrow(/paid record/);
  });

  it("a manual loan repayment recalculates a calculated run, and is refused while an approved run deducts it", async () => {
    const e = await w.emp({ basicSalary: 4000, joinDate: D("2020-01-02") });
    const loan = await requestLoan(w.hr, { employeeId: e.id, type: "STAFF_LOAN", principal: 900, installment: 300, startPeriod: "2026-08" });
    await decideLoan(w.hr, loan.id, true);
    const run = await createPayrollRun(w.payroll, { companyId: w.companyId, period: "2026-08", payDate: D("2026-08-28") });
    await calculatePayrollRun(w.payroll, run.id);
    const repaid = await recordLoanRepayment(w.hr, loan.id, 100, "Bank transfer REF123");
    expect(repaid.recalculate).toEqual(["2026-08"]);
    expect((await prisma.payrollRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe("DRAFT");
    await calculatePayrollRun(w.payroll, run.id);
    await approvePayrollRun(w.hr, run.id);
    await expect(recordLoanRepayment(w.hr, loan.id, 100, "Cash")).rejects.toThrow(/approved and already deducts/);
  });

  it("negative net pay can't be approved", async () => {
    const e = await w.emp({ basicSalary: 2000 });
    const ded = await payItem(w, "DED_OTHER");
    await addAdjustment(w.payroll, { employeeId: e.id, payItemId: ded.id, period: "2026-09", amount: 5000, note: "Damage" });
    const run = await createPayrollRun(w.payroll, { companyId: w.companyId, period: "2026-09", payDate: D("2026-09-28") });
    await calculatePayrollRun(w.payroll, run.id);
    await expect(approvePayrollRun(w.hr, run.id)).rejects.toThrow(/net pay is negative/);
  });

  it("pay dates follow EA 1955 s.19 (within 7 days after the month ends)", async () => {
    await expect(createPayrollRun(w.payroll, { companyId: w.companyId, period: "2026-10", payDate: D("2026-11-08") })).rejects.toThrow(/s\.19/);
    await expect(createPayrollRun(w.payroll, { companyId: w.companyId, period: "2026-10", payDate: D("2026-11-07") })).resolves.toBeTruthy();
  });
});

describe("Reference numbers", () => {
  it("tickets and grievances raised at the same moment get distinct numbers", async () => {
    const w = await makeWorld();
    const tickets = await Promise.all(
      Array.from({ length: 6 }, (_, i) => openTicket(w.employee, { category: "PAYROLL", subject: `Q${i}`, description: "Payslip question", priority: "MEDIUM" })),
    );
    expect(new Set(tickets.map((t) => t.refNo)).size).toBe(6);
    const grievances = await Promise.all(
      Array.from({ length: 4 }, (_, i) => fileGrievance(w.employee, { employeeId: w.employeeId, anonymous: false, category: "WORKPLACE", subject: `G${i}`, description: "Details" })),
    );
    expect(new Set(grievances.map((g) => g.refNo)).size).toBe(4);
  });
});

describe("Plan seat limit under concurrency", () => {
  it("two hires at the same moment can't take a Starter workspace past 25", async () => {
    const w = await makeWorld();
    await prisma.tenant.update({ where: { id: w.tenantId }, data: { plan: "STARTER" } });
    const current = await prisma.employee.count({ where: { tenantId: w.tenantId } });
    await prisma.employee.createMany({
      data: Array.from({ length: 24 - current }, (_, i) => ({
        tenantId: w.tenantId, companyId: w.companyId, employeeNo: `FILL${i}`, fullName: `Filler ${i}`, email: `f${i}-${randomUUID().slice(0, 6)}@t.my`, joinDate: D("2024-01-01"), basicSalary: 3000,
      })),
    });
    const hire = (no: string) =>
      createEmployee(w.owner, { employeeNo: no, fullName: "New Hire", email: `n-${randomUUID().slice(0, 8)}@t.my`, icNo: nric(), jobTitle: "Exec", joinDate: D("2026-09-01"), basicSalary: 3000, probationMonths: 0, companyId: w.companyId }, { skipOnboarding: true });
    const results = await Promise.allSettled([hire("RACE-A"), hire("RACE-B")]);
    expect(await prisma.employee.count({ where: { tenantId: w.tenantId } })).toBeLessThanOrEqual(25);
    for (const r of results) if (r.status === "rejected") expect(String(r.reason)).toMatch(/Starter plan covers up to 25/);
  });
});

describe("Session revocation", () => {
  let w: World;
  beforeAll(async () => {
    w = await makeWorld();
  });
  const version = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).sessionVersion;

  it("admin password reset, deactivation and 'log out everywhere' revoke existing sessions", async () => {
    const v0 = await version(w.employee.userId);
    await resetUserPassword(w.hr, w.employee.userId, "a-new-password-1");
    expect(await version(w.employee.userId)).toBe(v0 + 1);
    await logOutEverywhere(w.employee);
    expect(await version(w.employee.userId)).toBe(v0 + 2);
    await setUserActive(w.hr, w.employee.userId, false);
    expect(await version(w.employee.userId)).toBe(v0 + 3);
  });

  it("a reset link works once, even when used twice at the same moment", async () => {
    const token = await issueToken(w.manager.userId, "RESET", 1);
    const results = await Promise.allSettled([resetPassword(token, "first-password-1"), resetPassword(token, "second-password-2")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
});

describe("Protected separations", () => {
  let w: World;
  beforeAll(async () => {
    w = await makeWorld();
  });

  it("no retrenchment or termination during maternity leave, except dismissal for proven misconduct", async () => {
    const e = await w.emp({ gender: "FEMALE", icNo: nric("900101", "FEMALE") });
    const ml = await leaveType(w.tenantId, "ML");
    await prisma.leaveRequest.create({
      data: { tenantId: w.tenantId, employeeId: e.id, leaveTypeId: ml.id, startDate: D("2026-11-02"), endDate: D("2027-02-07"), days: 98, status: "APPROVED" },
    });
    const dates = { noticeDate: D("2026-10-01"), lastWorkingDate: D("2026-11-30") };
    await expect(createSeparation(w.hr, { employeeId: e.id, type: "RETRENCHMENT", ...dates })).rejects.toThrow(/s\.41A/);
    await expect(createSeparation(w.hr, { employeeId: e.id, type: "TERMINATION", ...dates })).rejects.toThrow(/s\.41A/);
    await prisma.disciplinaryCase.create({
      data: { tenantId: w.tenantId, caseNo: "DC-T-1", employeeId: e.id, category: "FRAUD", severity: "GROSS", incidentDate: D("2026-08-01"), description: "Falsified claims", stage: "DECIDED", outcome: "DISMISSAL" },
    });
    await expect(createSeparation(w.hr, { employeeId: e.id, type: "TERMINATION", ...dates })).resolves.toBeTruthy();
  });

  it("nobody is retired before 60", async () => {
    const young = await w.emp({ icNo: nric("900101") });
    await expect(createSeparation(w.hr, { employeeId: young.id, type: "RETIREMENT", noticeDate: D("2026-10-01"), lastWorkingDate: D("2026-12-31") })).rejects.toThrow(/before age 60/);
  });
});
