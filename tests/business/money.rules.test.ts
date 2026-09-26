import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { addDays, periodOf, todayMY } from "@/lib/utils";
import { applyDueCompensation, approveCompensation, cancelClaim, decideClaim, decideLoan, proposeCompensation, rejectCompensation, requestLoan, submitClaim } from "@/server/services/money.service";
import { D, makeWorld, type World } from "./factory";

let w: World;
beforeAll(async () => {
  w = await makeWorld();
});

const type = (name: string) => prisma.claimType.findFirstOrThrow({ where: { tenantId: w.tenantId, name } });
const recent = (n = 2) => addDays(todayMY(), -n);

describe("Claims", () => {
  it("enforces the monthly limit per claim type", async () => {
    const e = await w.emp();
    const t = await type("Medical (Outpatient)"); // RM300 / month
    const d = recent(1);
    await submitClaim(w.hr, { employeeId: e.id, claimTypeId: t.id, date: d, amount: 250, description: "GP", receiptUrl: "a.jpg" });
    await expect(submitClaim(w.hr, { employeeId: e.id, claimTypeId: t.id, date: d, amount: 60, description: "GP again", receiptUrl: "b.jpg" })).rejects.toThrow(/monthly/);
  });

  it("enforces the yearly limit", async () => {
    const e = await w.emp();
    const t = await type("Optical"); // RM400 / year
    await submitClaim(w.hr, { employeeId: e.id, claimTypeId: t.id, date: recent(1), amount: 380, description: "Glasses", receiptUrl: "g.jpg" });
    await expect(submitClaim(w.hr, { employeeId: e.id, claimTypeId: t.id, date: recent(2), amount: 30, description: "Lens", receiptUrl: "l.jpg" })).rejects.toThrow(/yearly/);
  });

  it("rejected claims don't count toward limits", async () => {
    const e = await w.emp();
    const t = await type("Optical");
    const c = await submitClaim(w.hr, { employeeId: e.id, claimTypeId: t.id, date: recent(1), amount: 380, description: "Glasses", receiptUrl: "g.jpg" });
    await decideClaim(w.hr, c.id, false, "Not covered");
    await submitClaim(w.hr, { employeeId: e.id, claimTypeId: t.id, date: recent(1), amount: 390, description: "Glasses v2", receiptUrl: "g2.jpg" });
  });

  it("requires receipts where configured", async () => {
    const e = await w.emp();
    const t = await type("Dental");
    await expect(submitClaim(w.hr, { employeeId: e.id, claimTypeId: t.id, date: recent(), amount: 100, description: "Scaling" })).rejects.toThrow(/receipt/);
  });

  it("computes mileage from km × tenant rate", async () => {
    const e = await w.emp();
    const t = await type("Mileage");
    await expect(submitClaim(w.hr, { employeeId: e.id, claimTypeId: t.id, date: recent(), description: "Client visit" })).rejects.toThrow(/distance/);
    const c = await submitClaim(w.hr, { employeeId: e.id, claimTypeId: t.id, date: recent(), mileageKm: 42.5, description: "Client visit" });
    expect(c.amount).toBe(25.5); // 42.5 × 0.60
  });

  it("rejects future-dated, stale (> 90 days) and zero-value claims", async () => {
    const e = await w.emp();
    const t = await type("Toll & Parking");
    await expect(submitClaim(w.hr, { employeeId: e.id, claimTypeId: t.id, date: addDays(todayMY(), 2), amount: 10, description: "x", receiptUrl: "r" })).rejects.toThrow(/future/);
    await expect(submitClaim(w.hr, { employeeId: e.id, claimTypeId: t.id, date: addDays(todayMY(), -91), amount: 10, description: "x", receiptUrl: "r" })).rejects.toThrow(/90 days/);
    await expect(submitClaim(w.hr, { employeeId: e.id, claimTypeId: t.id, date: recent(), amount: 0, description: "x", receiptUrl: "r" })).rejects.toThrow(/more than zero/);
  });

  it("detects duplicates (same type, date and amount)", async () => {
    const e = await w.emp();
    const t = await type("Toll & Parking");
    const d = recent(3);
    await submitClaim(w.hr, { employeeId: e.id, claimTypeId: t.id, date: d, amount: 12.3, description: "PLUS", receiptUrl: "r" });
    await expect(submitClaim(w.hr, { employeeId: e.id, claimTypeId: t.id, date: d, amount: 12.3, description: "PLUS", receiptUrl: "r" })).rejects.toThrow(/duplicate/);
  });

  it("employees submit only for themselves", async () => {
    const t = await type("Toll & Parking");
    await expect(submitClaim(w.employee, { employeeId: w.managerEmployeeId, claimTypeId: t.id, date: recent(), amount: 5, description: "x", receiptUrl: "r" })).rejects.toThrow(/permission/);
    const own = await submitClaim(w.employee, { employeeId: w.employeeId, claimTypeId: t.id, date: recent(4), amount: 5, description: "x", receiptUrl: "r" });
    expect(own.status).toBe("PENDING");
  });

  it("rejection needs a reason; approval by the manager of the claimant works", async () => {
    const t = await type("Toll & Parking");
    const c = await submitClaim(w.employee, { employeeId: w.employeeId, claimTypeId: t.id, date: recent(5), amount: 7, description: "x", receiptUrl: "r" });
    await expect(decideClaim(w.manager, c.id, false, "")).rejects.toThrow(/reason/);
    const ok = await decideClaim(w.manager, c.id, true);
    expect(ok.status).toBe("APPROVED");
  });

  it("only pending claims can be withdrawn", async () => {
    const t = await type("Toll & Parking");
    const c = await submitClaim(w.employee, { employeeId: w.employeeId, claimTypeId: t.id, date: recent(6), amount: 8, description: "x", receiptUrl: "r" });
    await decideClaim(w.hr, c.id, true);
    await expect(cancelClaim(w.employee, c.id)).rejects.toThrow(/pending/);
  });
});

describe("Loans & salary advances", () => {
  const next = () => periodOf(addDays(todayMY(), 31));

  it("salary advances are capped at 50% of basic and recovered in one go", async () => {
    const { id } = await w.emp({ basicSalary: 4000 });
    await expect(requestLoan(w.hr, { employeeId: id, type: "SALARY_ADVANCE", principal: 2500, installment: 2500, startPeriod: next() })).rejects.toThrow(/50%/);
    await expect(requestLoan(w.hr, { employeeId: id, type: "SALARY_ADVANCE", principal: 1000, installment: 500, startPeriod: next() })).rejects.toThrow(/in full/);
    const ok = await requestLoan(w.hr, { employeeId: id, type: "SALARY_ADVANCE", principal: 1000, installment: 1000, startPeriod: next() });
    expect(ok.balance).toBe(1000);
  });

  it("staff loan instalments are capped at 25% of basic and 60 months", async () => {
    const { id } = await w.emp({ basicSalary: 4000 });
    await expect(requestLoan(w.hr, { employeeId: id, type: "STAFF_LOAN", principal: 5000, installment: 1200, startPeriod: next() })).rejects.toThrow(/25%/);
    await expect(requestLoan(w.hr, { employeeId: id, type: "STAFF_LOAN", principal: 50000, installment: 500, startPeriod: next() })).rejects.toThrow(/60 months/);
  });

  it("no staff loans on probation or during notice", async () => {
    const prob = await w.emp({ joinDate: D("2026-08-03"), probationMonths: 3 });
    await expect(requestLoan(w.hr, { employeeId: prob.id, type: "STAFF_LOAN", principal: 1000, installment: 200, startPeriod: next() })).rejects.toThrow(/after confirmation/);
    const leaving = await w.emp();
    await prisma.employee.update({ where: { id: leaving.id }, data: { status: "NOTICE" } });
    await expect(requestLoan(w.hr, { employeeId: leaving.id, type: "SALARY_ADVANCE", principal: 500, installment: 500, startPeriod: next() })).rejects.toThrow(/notice/);
  });

  it("one open loan per type", async () => {
    const { id } = await w.emp();
    await requestLoan(w.hr, { employeeId: id, type: "STAFF_LOAN", principal: 1000, installment: 200, startPeriod: next() });
    await expect(requestLoan(w.hr, { employeeId: id, type: "STAFF_LOAN", principal: 1000, installment: 200, startPeriod: next() })).rejects.toThrow(/already an open loan/);
  });

  it("managers cannot approve loans; payroll can", async () => {
    const l = await requestLoan(w.employee, { employeeId: w.employeeId, type: "SALARY_ADVANCE", principal: 500, installment: 500, startPeriod: next() });
    await expect(decideLoan(w.manager, l.id, true)).rejects.toThrow(/permission/);
    expect((await decideLoan(w.payroll, l.id, true)).status).toBe("ACTIVE");
  });
});

describe("Compensation", () => {
  it("increments update salary and history once approved", async () => {
    const { id } = await w.emp({ basicSalary: 5000 });
    const { change } = await proposeCompensation(w.hr, { employeeId: id, type: "INCREMENT", effectiveDate: D("2026-10-01"), newSalary: 5500, reason: "Merit" });
    expect((await prisma.employee.findUniqueOrThrow({ where: { id } })).basicSalary).toBe(5000);
    await approveCompensation(w.owner, change.id, { today: D("2026-10-01") });
    expect((await prisma.employee.findUniqueOrThrow({ where: { id } })).basicSalary).toBe(5500);
    const h = await prisma.employmentHistory.findFirst({ where: { employeeId: id, type: "INCREMENT" } });
    expect(h?.title).toMatch(/\+10%/);
  });

  it("future-dated increments are scheduled, then applied once (before payroll) when the date arrives", async () => {
    const { id } = await w.emp({ basicSalary: 5000 });
    const { change } = await proposeCompensation(w.hr, { employeeId: id, type: "INCREMENT", effectiveDate: D("2026-11-01"), newSalary: 5600 });
    const scheduled = await approveCompensation(w.owner, change.id, { today: D("2026-10-15") });
    expect(scheduled.status).toBe("APPROVED");
    expect((await prisma.employee.findUniqueOrThrow({ where: { id } })).basicSalary).toBe(5000);
    expect(await applyDueCompensation(w.owner, D("2026-10-31"))).toBe(0);
    expect(await applyDueCompensation(w.owner, D("2026-11-01"))).toBeGreaterThanOrEqual(1);
    expect(await applyDueCompensation(w.owner, D("2026-11-02"))).toBe(0);
    expect((await prisma.employee.findUniqueOrThrow({ where: { id } })).basicSalary).toBe(5600);
    expect(await prisma.employmentHistory.count({ where: { employeeId: id, type: "INCREMENT" } })).toBe(1);
  });

  it("approving the same change twice at once applies it exactly once", async () => {
    const { id } = await w.emp({ basicSalary: 5000 });
    const { change } = await proposeCompensation(w.hr, { employeeId: id, type: "BONUS", effectiveDate: D("2026-09-01"), bonusAmount: 1000 });
    const results = await Promise.allSettled([approveCompensation(w.owner, change.id), approveCompensation(w.owner, change.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.payrollAdjustment.count({ where: { employeeId: id } })).toBe(1);
  });

  it("promotions require a new title", async () => {
    const { id } = await w.emp();
    await expect(proposeCompensation(w.hr, { employeeId: id, type: "PROMOTION", effectiveDate: D("2026-10-01"), newSalary: 6000 })).rejects.toThrow(/title/);
  });

  it("decreases must be recorded as adjustments", async () => {
    const { id } = await w.emp({ basicSalary: 5000 });
    await expect(proposeCompensation(w.hr, { employeeId: id, type: "INCREMENT", effectiveDate: D("2026-10-01"), newSalary: 4000 })).rejects.toThrow(/adjustment/);
  });

  it("no-op changes are rejected", async () => {
    const { id } = await w.emp({ basicSalary: 5000 });
    await expect(proposeCompensation(w.hr, { employeeId: id, type: "INCREMENT", effectiveDate: D("2026-10-01"), newSalary: 5000 })).rejects.toThrow(/Nothing changes/);
  });

  it("warns when above the grade maximum", async () => {
    const g = await prisma.jobGrade.findFirstOrThrow({ where: { tenantId: w.tenantId, code: "G2" } });
    const { id } = await w.emp({ basicSalary: 5000, gradeId: g.id });
    const { warnings } = await proposeCompensation(w.hr, { employeeId: id, type: "INCREMENT", effectiveDate: D("2026-10-01"), newSalary: 9000 });
    expect(warnings.join()).toMatch(/band maximum/);
  });

  it("bonuses become a payroll adjustment in the effective month", async () => {
    const { id } = await w.emp();
    const { change } = await proposeCompensation(w.hr, { employeeId: id, type: "BONUS", effectiveDate: D("2026-12-15"), bonusAmount: 3000, reason: "Year-end" });
    await approveCompensation(w.owner, change.id);
    const adj = await prisma.payrollAdjustment.findFirst({ where: { employeeId: id, period: "2026-12" }, include: { payItem: true } });
    expect(adj).toMatchObject({ amount: 3000 });
    expect(adj?.payItem.code).toBe("BONUS");
  });

  it("you can't approve your own change; rejected changes stay rejected", async () => {
    const hrEmp = await w.emp();
    const hrCtx = await w.ctxFor(hrEmp.id, "HR_ADMIN");
    const { change } = await proposeCompensation(w.owner, { employeeId: hrEmp.id, type: "INCREMENT", effectiveDate: D("2026-10-01"), newSalary: 5500 });
    await expect(approveCompensation(hrCtx, change.id)).rejects.toThrow(/your own/);
    await rejectCompensation(w.owner, change.id);
    await expect(approveCompensation(w.owner, change.id)).rejects.toThrow(/rejected/);
  });
});
