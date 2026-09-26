/**
 * Data-integrity rules: tenant isolation on every "on behalf of" path, team scope for managers,
 * exactly-once state transitions under concurrent requests, and payroll/settlement edge cases.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { applyLeave, approveLeave, creditReplacementLeave } from "@/server/services/leave.service";
import { approveCompensation, proposeCompensation, requestLoan, decideLoan, submitClaim } from "@/server/services/money.service";
import { approvePayrollRun, calculatePayrollRun, createPayrollRun, markPayrollPaid } from "@/server/services/payroll.service";
import { saveTaxDeclaration } from "@/server/services/tax.service";
import { addChild } from "@/server/services/employee.service";
import { giveKudos } from "@/server/services/culture.service";
import { requestOvertime } from "@/server/services/time.service";
import { setGoal } from "@/server/services/talent.service";
import { approveSeparation, createSeparation, postFinalSettlement, withdrawSeparation } from "@/server/services/lifecycle.service";
import { canReadUpload } from "@/server/services/upload.service";
import { checkout } from "@/server/services/subscription.service";
import { D, leaveType, makeWorld, type World } from "./factory";
import { todayMY } from "@/lib/utils";

async function claimType(w: World) {
  return prisma.claimType.findFirstOrThrow({ where: { tenantId: w.tenantId, category: { not: "MILEAGE" }, requiresReceipt: false } }).catch(() =>
    prisma.claimType.create({ data: { tenantId: w.tenantId, name: "Meal", category: "MEAL", requiresReceipt: false } }),
  );
}

describe("Tenant isolation on on-behalf actions", () => {
  let a: World;
  let b: World;
  beforeAll(async () => {
    [a, b] = await Promise.all([makeWorld(), makeWorld()]);
  });

  it("HR can't file claims, OT, loans or leave for another workspace's employee", async () => {
    const ct = await claimType(a);
    const today = todayMY();
    await expect(submitClaim(a.hr, { employeeId: b.employeeId, claimTypeId: ct.id, date: today, amount: 10, description: "x" })).rejects.toThrow(/not found/i);
    await expect(requestOvertime(a.hr, { employeeId: b.employeeId, date: today, hours: 2 })).rejects.toThrow(/not found/i);
    await expect(requestLoan(a.hr, { employeeId: b.employeeId, type: "STAFF_LOAN", principal: 1000, installment: 100, startPeriod: "2026-12" })).rejects.toThrow(/not found/i);
    const al = await leaveType(a.tenantId, "AL");
    await expect(applyLeave(a.hr, { employeeId: b.employeeId, leaveTypeId: al.id, startDate: D("2026-11-17"), endDate: D("2026-11-17") })).rejects.toThrow(/not found/i);
  });

  it("HR can't change another workspace's tax reliefs, children, goals or replacement leave", async () => {
    await expect(saveTaxDeclaration(a.hr, b.employeeId, 2026, { lifestyle: 2500 })).rejects.toThrow(/not found/i);
    await expect(addChild(a.hr, b.employeeId, { name: "Kid", dateOfBirth: D("2015-01-01") })).rejects.toThrow(/not found/i);
    await expect(setGoal(a.hr, { employeeId: b.employeeId, title: "Goal", kind: "KPI", weight: 10 })).rejects.toThrow(/not found/i);
    await expect(creditReplacementLeave(a.hr, b.employeeId, 1, "Worked PH")).rejects.toThrow(/not found/i);
    expect(await prisma.taxDeclaration.count({ where: { employeeId: b.employeeId } })).toBe(0);
    expect(await prisma.employeeChild.count({ where: { employeeId: b.employeeId } })).toBe(0);
  });

  it("kudos can't be sent to someone in another workspace", async () => {
    await expect(giveKudos(a.employee, { toId: b.employeeId, value: "Teamwork", message: "Great job on that!" })).rejects.toThrow(/colleague/);
  });
});

describe("Team scope", () => {
  let w: World;
  beforeAll(async () => {
    w = await makeWorld();
  });

  it("a manager can act for their reports but not for people outside their team", async () => {
    const ct = await claimType(w);
    const outsider = await w.emp();
    const today = todayMY();
    await expect(submitClaim(w.manager, { employeeId: outsider.id, claimTypeId: ct.id, date: today, amount: 12, description: "Lunch" })).rejects.toThrow(/your team/);
    const own = await submitClaim(w.manager, { employeeId: w.employeeId, claimTypeId: ct.id, date: today, amount: 12, description: "Lunch" });
    expect(own.employeeId).toBe(w.employeeId);
  });

  it("an employee can't act for anyone else", async () => {
    const ct = await claimType(w);
    await expect(submitClaim(w.employee, { employeeId: w.managerEmployeeId, claimTypeId: ct.id, date: todayMY(), amount: 5, description: "x" })).rejects.toThrow(/permission/);
  });
});

describe("Exactly-once transitions under concurrency", () => {
  let w: World;
  beforeAll(async () => {
    w = await makeWorld();
  });

  it("two simultaneous approvals of the same leave count it once", async () => {
    const al = await leaveType(w.tenantId, "AL");
    const req = await applyLeave(w.hr, { employeeId: w.employeeId, leaveTypeId: al.id, startDate: D("2026-11-17"), endDate: D("2026-11-18") });
    const results = await Promise.allSettled([approveLeave(w.manager, req.id), approveLeave(w.owner, req.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const bal = await prisma.leaveBalance.findFirstOrThrow({ where: { employeeId: w.employeeId, leaveTypeId: al.id, year: 2026 } });
    expect(bal).toMatchObject({ taken: 2, pending: 0 });
  });

  it("marking a payroll paid twice posts loan repayments once", async () => {
    const e = await w.emp({ basicSalary: 4000, joinDate: D("2020-01-02") });
    const loan = await requestLoan(w.hr, { employeeId: e.id, type: "STAFF_LOAN", principal: 1500, installment: 500, startPeriod: "2026-06" });
    await decideLoan(w.hr, loan.id, true);
    const run = await createPayrollRun(w.payroll, { companyId: w.companyId, period: "2026-06", payDate: D("2026-06-28") });
    await calculatePayrollRun(w.payroll, run.id);
    await approvePayrollRun(w.hr, run.id);
    const results = await Promise.allSettled([markPayrollPaid(w.hr, run.id), markPayrollPaid(w.owner, run.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const after = await prisma.loan.findUniqueOrThrow({ where: { id: loan.id }, include: { repayments: true } });
    expect(after.repayments).toHaveLength(1);
    expect(after.balance).toBe(1000);
  });

  it("a bonus dated into a finalised payroll month is paid in the next open month, not lost", async () => {
    const e = await w.emp();
    const { change } = await proposeCompensation(w.hr, { employeeId: e.id, type: "BONUS", effectiveDate: D("2026-06-15"), bonusAmount: 800 });
    await approveCompensation(w.owner, change.id);
    const adj = await prisma.payrollAdjustment.findFirstOrThrow({ where: { employeeId: e.id } });
    expect(adj.period).toBe("2026-07");
  });

  it("paying the same plan twice in a row charges once", async () => {
    const t = await makeWorld();
    await prisma.tenant.update({ where: { id: t.tenantId }, data: { subscriptionStatus: "TRIALING", trialEndsAt: new Date(Date.now() - 86400000) } });
    await checkout(t.owner, { plan: "ENTERPRISE", cycle: "MONTHLY", method: "FPX" });
    await expect(checkout(t.owner, { plan: "ENTERPRISE", cycle: "MONTHLY", method: "FPX" })).rejects.toThrow(/didn't charge you again/);
    expect(await prisma.invoice.count({ where: { tenantId: t.tenantId } })).toBe(1);
  });
});

describe("Separation settlement", () => {
  let w: World;
  beforeAll(async () => {
    w = await makeWorld();
  });

  it("final settlement posts once, and a posted settlement blocks withdrawal", async () => {
    const e = await w.emp({ joinDate: D("2021-01-04") });
    const sep = await createSeparation(w.hr, { employeeId: e.id, type: "RETRENCHMENT", noticeDate: D("2026-10-01"), lastWorkingDate: D("2026-11-30"), reason: "Restructure" });
    await approveSeparation(w.hr, sep.id);
    const results = await Promise.allSettled([postFinalSettlement(w.hr, sep.id), postFinalSettlement(w.owner, sep.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const terminationLines = await prisma.payrollAdjustment.count({ where: { employeeId: e.id, note: { contains: "Termination benefit" } } });
    expect(terminationLines).toBe(1);
    await expect(withdrawSeparation(w.hr, sep.id)).rejects.toThrow(/final settlement was already posted/);
  });

  it("nobody approves their own separation", async () => {
    const hrEmp = await w.emp();
    const hrCtx = await w.ctxFor(hrEmp.id, "HR_ADMIN");
    const sep = await createSeparation(hrCtx, { employeeId: hrEmp.id, type: "RESIGNATION", noticeDate: D("2026-10-01"), lastWorkingDate: D("2026-11-30") });
    await expect(approveSeparation(hrCtx, sep.id)).rejects.toThrow(/Someone else/);
  });
});

describe("Who can open an uploaded file", () => {
  let w: World;
  beforeAll(async () => {
    w = await makeWorld();
  });

  async function upload(uploadedById: string | null) {
    return prisma.upload.create({ data: { tenantId: w.tenantId, fileName: "mc.pdf", mimeType: "application/pdf", size: 10, storagePath: "x", uploadedById, purpose: "LEAVE" } });
  }

  it("a team manager sees their report's MC, but not another team's or an unlinked file", async () => {
    const up = await upload(w.employee.userId);
    const sl = await leaveType(w.tenantId, "SL");
    await prisma.leaveRequest.create({
      data: { tenantId: w.tenantId, employeeId: w.employeeId, leaveTypeId: sl.id, startDate: D("2026-09-01"), endDate: D("2026-09-01"), days: 1, attachment: `/api/files/${up.id}` },
    });
    expect(await canReadUpload(w.employee, up)).toBe(true); // uploader
    expect(await canReadUpload(w.manager, up)).toBe(true); // their manager
    const otherMgrEmp = await w.emp();
    const otherMgr = await w.ctxFor(otherMgrEmp.id, "MANAGER");
    expect(await canReadUpload(otherMgr, up)).toBe(false);
    const colleague = await w.emp({}, { login: "EMPLOYEE" });
    expect(await canReadUpload(colleague.ctx!, up)).toBe(false);
    expect(await canReadUpload(w.hr, up)).toBe(true);
    const stray = await upload(w.hr.userId);
    expect(await canReadUpload(w.manager, stray)).toBe(false);
  });

  it("letterhead artwork is visible to everyone in the workspace", async () => {
    const logo = await upload(w.hr.userId);
    await prisma.company.update({ where: { id: w.companyId }, data: { letterheadLogo: `/api/files/${logo.id}` } });
    expect(await canReadUpload(w.employee, logo)).toBe(true);
  });
});
