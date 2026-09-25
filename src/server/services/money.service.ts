import { prisma } from "@/lib/db";
import { parsePeriod, periodOf, round2, todayMY, utcDate } from "@/lib/utils";
import { assertCan, assertCanApproveFor, audit, notifyEmployee } from "../guard";
import { DomainError, type Ctx } from "../types";

// ───────────── Claims ─────────────

export interface ClaimInput {
  employeeId: string;
  claimTypeId: string;
  date: Date;
  amount?: number;
  mileageKm?: number | null;
  description: string;
  merchant?: string | null;
  receiptUrl?: string | null;
}

/** Usage of a claim type (approved + pending + paid) in the month and year of `date`. */
export async function claimUsage(employeeId: string, claimTypeId: string, date: Date) {
  const { start, end } = parsePeriod(periodOf(date));
  const y = date.getUTCFullYear();
  const [month, year] = await Promise.all([
    prisma.claim.aggregate({ where: { employeeId, claimTypeId, status: { in: ["PENDING", "APPROVED", "PAID"] }, date: { gte: start, lte: end } }, _sum: { amount: true } }),
    prisma.claim.aggregate({
      where: { employeeId, claimTypeId, status: { in: ["PENDING", "APPROVED", "PAID"] }, date: { gte: utcDate(y, 0, 1), lte: utcDate(y, 11, 31) } },
      _sum: { amount: true },
    }),
  ]);
  return { month: round2(month._sum.amount ?? 0), year: round2(year._sum.amount ?? 0) };
}

export async function submitClaim(ctx: Ctx, input: ClaimInput) {
  if (input.employeeId !== ctx.employeeId) assertCan(ctx, "claims.approve");
  const [type, tenant] = await Promise.all([
    prisma.claimType.findFirst({ where: { id: input.claimTypeId, tenantId: ctx.tenantId, active: true } }),
    prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } }),
  ]);
  if (!type) throw new DomainError("Claim type not available.");
  if (!input.description?.trim()) throw new DomainError("Please describe what this claim is for.");
  if (input.date > todayMY()) throw new DomainError("Claims can't be dated in the future.");
  const ageDays = (todayMY().getTime() - input.date.getTime()) / 86400000;
  if (ageDays > 90) throw new DomainError("Claims must be submitted within 90 days of the expense.");

  let amount = round2(input.amount ?? 0);
  if (type.category === "MILEAGE") {
    if (!input.mileageKm || input.mileageKm <= 0) throw new DomainError("Enter the distance travelled (km).");
    amount = round2(input.mileageKm * tenant.mileageRate);
  }
  if (amount <= 0) throw new DomainError("Claim amount must be more than zero.");
  if (type.requiresReceipt && !input.receiptUrl) throw new DomainError(`${type.name} claims need a receipt.`);

  const usage = await claimUsage(input.employeeId, type.id, input.date);
  if (type.monthlyLimit != null && usage.month + amount > type.monthlyLimit) {
    throw new DomainError(`Over the monthly ${type.name} limit of RM${type.monthlyLimit} (used RM${usage.month}).`);
  }
  if (type.yearlyLimit != null && usage.year + amount > type.yearlyLimit) {
    throw new DomainError(`Over the yearly ${type.name} limit of RM${type.yearlyLimit} (used RM${usage.year}).`);
  }
  const dup = await prisma.claim.findFirst({
    where: { employeeId: input.employeeId, claimTypeId: type.id, date: input.date, amount, status: { in: ["PENDING", "APPROVED", "PAID"] } },
  });
  if (dup) throw new DomainError("Looks like a duplicate of an existing claim (same type, date and amount).");

  const claim = await prisma.claim.create({
    data: {
      tenantId: ctx.tenantId,
      employeeId: input.employeeId,
      claimTypeId: type.id,
      date: input.date,
      amount,
      mileageKm: input.mileageKm ?? null,
      description: input.description,
      merchant: input.merchant ?? null,
      receiptUrl: input.receiptUrl ?? null,
    },
  });
  const emp = await prisma.employee.findUniqueOrThrow({ where: { id: input.employeeId } });
  if (emp.managerId) await notifyEmployee(emp.managerId, `${emp.preferredName ?? emp.fullName} submitted a ${type.name} claim`, `RM${amount}`, "/approvals");
  return claim;
}

export async function decideClaim(ctx: Ctx, id: string, approve: boolean, note?: string) {
  const c = await prisma.claim.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { employee: true, claimType: true } });
  if (!c) throw new DomainError("Claim not found.");
  await assertCanApproveFor(ctx, c.employeeId, "claims.approve");
  if (c.status !== "PENDING") throw new DomainError(`Already ${c.status.toLowerCase()}.`);
  if (!approve && !note?.trim()) throw new DomainError("Please give a reason when rejecting a claim.");
  const updated = await prisma.claim.update({
    where: { id },
    data: { status: approve ? "APPROVED" : "REJECTED", approverId: ctx.userId, approverNote: note ?? null, decidedAt: new Date() },
  });
  await notifyEmployee(c.employeeId, `Your ${c.claimType.name} claim (RM${c.amount}) was ${approve ? "approved ✅" : "rejected"}`, note, "/me/claims");
  await audit(ctx, approve ? "APPROVE" : "REJECT", "Claim", id, `${approve ? "Approved" : "Rejected"} RM${c.amount} ${c.claimType.name} for ${c.employee.fullName}`);
  return updated;
}

export async function cancelClaim(ctx: Ctx, id: string) {
  const c = await prisma.claim.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!c) throw new DomainError("Claim not found.");
  if (c.employeeId !== ctx.employeeId) assertCan(ctx, "claims.approve");
  if (c.status !== "PENDING") throw new DomainError("Only pending claims can be withdrawn.");
  await prisma.claim.delete({ where: { id } });
}

// ───────────── Loans & advances ─────────────

export interface LoanInput {
  employeeId: string;
  type: "SALARY_ADVANCE" | "STAFF_LOAN" | "EDUCATION_LOAN";
  principal: number;
  installment: number;
  startPeriod: string;
  reason?: string;
}

/** Number of instalments needed and the final instalment. */
export function loanSchedule(principal: number, installment: number, startPeriod: string) {
  const out: { period: string; amount: number; balance: number }[] = [];
  let bal = round2(principal);
  let [y, m] = startPeriod.split("-").map(Number);
  while (bal > 0 && out.length < 240) {
    const amt = round2(Math.min(installment, bal));
    bal = round2(bal - amt);
    out.push({ period: `${y}-${String(m).padStart(2, "0")}`, amount: amt, balance: bal });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export async function requestLoan(ctx: Ctx, input: LoanInput) {
  if (input.employeeId !== ctx.employeeId) assertCan(ctx, "loans.manage");
  const emp = await prisma.employee.findFirst({ where: { id: input.employeeId, tenantId: ctx.tenantId } });
  if (!emp) throw new DomainError("Employee not found.");
  if (emp.status === "PROBATION" && input.type !== "SALARY_ADVANCE") throw new DomainError("Staff loans are available after confirmation.");
  if (emp.status === "NOTICE") throw new DomainError("Loans aren't available during the notice period.");
  if (input.principal <= 0 || input.installment <= 0) throw new DomainError("Amount and instalment must be positive.");
  if (input.installment > input.principal) throw new DomainError("Instalment can't exceed the loan amount.");
  if (input.type === "SALARY_ADVANCE") {
    if (input.principal > emp.basicSalary * 0.5) throw new DomainError("Salary advances are capped at 50% of basic salary.");
    if (input.installment !== input.principal) throw new DomainError("Salary advances are recovered in full the next payroll.");
  }
  if (input.installment > emp.basicSalary * 0.25 && input.type !== "SALARY_ADVANCE") {
    throw new DomainError("Monthly instalment can't exceed 25% of basic salary.");
  }
  const schedule = loanSchedule(input.principal, input.installment, input.startPeriod);
  if (schedule.length > 60) throw new DomainError("Repayment can't exceed 60 months.");
  const open = await prisma.loan.count({ where: { employeeId: emp.id, status: { in: ["PENDING", "ACTIVE"] }, type: input.type } });
  if (open) throw new DomainError("There's already an open loan of this type.");
  return prisma.loan.create({
    data: { tenantId: ctx.tenantId, ...input, principal: round2(input.principal), installment: round2(input.installment), balance: round2(input.principal) },
  });
}

export async function decideLoan(ctx: Ctx, id: string, approve: boolean) {
  const loan = await prisma.loan.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { employee: true } });
  if (!loan) throw new DomainError("Loan not found.");
  assertCan(ctx, "loans.manage");
  await assertCanApproveFor(ctx, loan.employeeId, "loans.manage");
  if (loan.status !== "PENDING") throw new DomainError(`Already ${loan.status.toLowerCase()}.`);
  const updated = await prisma.loan.update({ where: { id }, data: { status: approve ? "ACTIVE" : "REJECTED", approverId: ctx.userId } });
  await notifyEmployee(loan.employeeId, `Your ${loan.type.toLowerCase().replace(/_/g, " ")} of RM${loan.principal} was ${approve ? "approved" : "rejected"}`);
  await audit(ctx, approve ? "APPROVE" : "REJECT", "Loan", id, `${approve ? "Approved" : "Rejected"} loan RM${loan.principal} for ${loan.employee.fullName}`);
  return updated;
}

// ───────────── Compensation ─────────────

export async function proposeCompensation(
  ctx: Ctx,
  input: { employeeId: string; type: "INCREMENT" | "PROMOTION" | "ADJUSTMENT" | "BONUS"; effectiveDate: Date; newSalary?: number; bonusAmount?: number; newTitle?: string; reason?: string },
) {
  assertCan(ctx, "compensation.manage");
  const emp = await prisma.employee.findFirst({ where: { id: input.employeeId, tenantId: ctx.tenantId }, include: { grade: true } });
  if (!emp) throw new DomainError("Employee not found.");
  const newSalary = input.type === "BONUS" ? emp.basicSalary : round2(input.newSalary ?? emp.basicSalary);
  if (input.type !== "BONUS" && newSalary === emp.basicSalary && !input.newTitle) throw new DomainError("Nothing changes — set a new salary or title.");
  if (input.type === "BONUS" && !(input.bonusAmount && input.bonusAmount > 0)) throw new DomainError("Enter a bonus amount.");
  if (input.type === "PROMOTION" && !input.newTitle) throw new DomainError("Promotions need a new job title.");
  if (newSalary < emp.basicSalary && input.type !== "ADJUSTMENT") throw new DomainError("Salary decreases must be recorded as an adjustment.");
  const warnings: string[] = [];
  if (emp.grade && newSalary > emp.grade.maxSalary) warnings.push(`Above ${emp.grade.code} band maximum (RM${emp.grade.maxSalary}).`);
  const change = await prisma.compensationChange.create({
    data: {
      tenantId: ctx.tenantId,
      employeeId: emp.id,
      type: input.type,
      effectiveDate: input.effectiveDate,
      oldSalary: emp.basicSalary,
      newSalary,
      bonusAmount: round2(input.bonusAmount ?? 0),
      newTitle: input.newTitle,
      reason: input.reason,
    },
  });
  return { change, warnings };
}

/** Approve & apply: updates salary/title, writes history, and for bonuses creates a payroll adjustment. */
export async function approveCompensation(ctx: Ctx, id: string) {
  assertCan(ctx, "compensation.manage");
  const c = await prisma.compensationChange.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { employee: true } });
  if (!c) throw new DomainError("Change not found.");
  if (c.status !== "PENDING") throw new DomainError(`Already ${c.status.toLowerCase()}.`);
  if (ctx.employeeId === c.employeeId) throw new DomainError("You can't approve your own compensation change.");
  if (c.type === "BONUS") {
    const bonus = await prisma.payItem.findFirst({ where: { tenantId: ctx.tenantId, code: "BONUS" } });
    if (!bonus) throw new DomainError("BONUS pay item is missing.");
    await prisma.payrollAdjustment.create({
      data: { tenantId: ctx.tenantId, employeeId: c.employeeId, payItemId: bonus.id, period: periodOf(c.effectiveDate), amount: c.bonusAmount, note: c.reason ?? "Bonus" },
    });
  } else {
    await prisma.employee.update({ where: { id: c.employeeId }, data: { basicSalary: c.newSalary, ...(c.newTitle ? { jobTitle: c.newTitle } : {}) } });
    const pct = c.oldSalary ? round2(((c.newSalary - c.oldSalary) / c.oldSalary) * 100) : 0;
    await prisma.employmentHistory.create({
      data: {
        employeeId: c.employeeId,
        effectiveDate: c.effectiveDate,
        type: c.type,
        title: c.newTitle ? `${c.type === "PROMOTION" ? "Promoted" : "Redesignated"} to ${c.newTitle}` : `Salary revised (${pct >= 0 ? "+" : ""}${pct}%)`,
        details: `RM${c.oldSalary.toLocaleString()} → RM${c.newSalary.toLocaleString()}`,
      },
    });
  }
  const updated = await prisma.compensationChange.update({ where: { id }, data: { status: "APPLIED" } });
  await notifyEmployee(c.employeeId, c.type === "BONUS" ? `A bonus of RM${c.bonusAmount} is coming your way 🎉` : "Your compensation has been updated 🎉");
  await audit(ctx, "APPROVE", "Compensation", id, `Applied ${c.type} for ${c.employee.fullName}`);
  return updated;
}

export async function rejectCompensation(ctx: Ctx, id: string) {
  assertCan(ctx, "compensation.manage");
  const c = await prisma.compensationChange.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!c || c.status !== "PENDING") throw new DomainError("Only pending changes can be rejected.");
  return prisma.compensationChange.update({ where: { id }, data: { status: "REJECTED" } });
}

/** Compa-ratio = salary ÷ grade midpoint. */
export function compaRatio(salary: number, mid: number) {
  return mid ? round2(salary / mid) : 0;
}
