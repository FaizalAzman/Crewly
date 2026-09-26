import { prisma } from "@/lib/db";
import { noticePeriodWeeks, ordinaryRateOfPay, serviceYears, terminationBenefit } from "@/lib/statutory/employment-act";
import { addDays, daysBetween, periodOf, round2, todayMY } from "@/lib/utils";
import { assertCan, audit, notifyEmployee } from "../guard";
import { DomainError, type Ctx } from "../types";
import { unusedAnnualLeave } from "./leave.service";

// ───────────── Checklists ─────────────

export async function createChecklistFromTemplate(ctx: Ctx, employeeId: string, type: "ONBOARDING" | "OFFBOARDING", anchor: Date, templateId?: string) {
  const template = templateId
    ? await prisma.checklistTemplate.findFirst({ where: { id: templateId, tenantId: ctx.tenantId }, include: { items: true } })
    : await prisma.checklistTemplate.findFirst({ where: { tenantId: ctx.tenantId, type }, include: { items: true } });
  if (!template) return null;
  const existing = await prisma.checklist.findFirst({ where: { employeeId, type } });
  if (existing) return existing;
  return prisma.checklist.create({
    data: {
      tenantId: ctx.tenantId,
      employeeId,
      type,
      title: template.name,
      tasks: {
        create: template.items
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((i) => ({ title: i.title, owner: i.owner, dueDate: addDays(anchor, i.dueOffsetDays), sortOrder: i.sortOrder })),
      },
    },
  });
}

export async function toggleTask(ctx: Ctx, taskId: string, done: boolean) {
  const task = await prisma.checklistTask.findUnique({ where: { id: taskId }, include: { checklist: true } });
  if (!task || task.checklist.tenantId !== ctx.tenantId) throw new DomainError("Task not found.");
  const own = ctx.employeeId === task.checklist.employeeId && task.owner === "EMPLOYEE";
  if (!own) assertCan(ctx, "lifecycle.manage");
  return prisma.checklistTask.update({ where: { id: taskId }, data: { done, doneAt: done ? new Date() : null } });
}

export async function addTask(ctx: Ctx, checklistId: string, title: string, owner: string, dueDate: Date | null) {
  assertCan(ctx, "lifecycle.manage");
  const cl = await prisma.checklist.findFirst({ where: { id: checklistId, tenantId: ctx.tenantId }, include: { tasks: true } });
  if (!cl) throw new DomainError("Checklist not found.");
  if (!title.trim()) throw new DomainError("Task title is required.");
  return prisma.checklistTask.create({ data: { checklistId, title, owner, dueDate, sortOrder: cl.tasks.length } });
}

export function checklistProgress(tasks: { done: boolean }[]) {
  if (!tasks.length) return 0;
  return Math.round((tasks.filter((t) => t.done).length / tasks.length) * 100);
}

// ───────────── Separation ─────────────

export type SeparationType = "RESIGNATION" | "TERMINATION" | "RETRENCHMENT" | "RETIREMENT" | "END_OF_CONTRACT" | "MUTUAL" | "DEATH";

export interface SeparationInput {
  employeeId: string;
  type: SeparationType;
  noticeDate: Date;
  lastWorkingDate: Date;
  reason?: string | null;
  waiveShortfall?: boolean;
}

/**
 * Computes final settlement figures:
 *  - Required notice: contractual (noticeWeeks) or EA s.12 minimum, in days.
 *  - Shortfall: notice not served. For resignations, the employee owes indemnity (deducted);
 *    for employer-initiated terminations, the employer pays notice pay in lieu.
 *  - Termination benefits (Employment (Termination and Lay-Off Benefits) Regulations 1980) for
 *    retrenchment / termination not due to misconduct, when service ≥ 12 months.
 *  - Leave encashment for unused, pro-rated annual leave.
 */
export async function previewSeparation(ctx: Ctx, input: SeparationInput) {
  const emp = await prisma.employee.findFirst({ where: { id: input.employeeId, tenantId: ctx.tenantId } });
  if (!emp) throw new DomainError("Employee not found.");
  if (input.lastWorkingDate < input.noticeDate) throw new DomainError("Last working day can't be before the notice date.");
  if (input.lastWorkingDate < emp.joinDate) throw new DomainError("Last working day can't be before the join date.");

  const years = serviceYears(emp.joinDate, input.lastWorkingDate);
  const weeks = emp.noticeWeeks ?? noticePeriodWeeks(years);
  const onProbation = emp.status === "PROBATION";
  const requiredNoticeDays = ["DEATH", "MUTUAL", "END_OF_CONTRACT", "RETIREMENT"].includes(input.type) ? 0 : onProbation ? 14 : weeks * 7;
  const servedDays = daysBetween(input.noticeDate, input.lastWorkingDate);
  const shortfallDays = Math.max(0, requiredNoticeDays - servedDays);
  const dailyRate = ordinaryRateOfPay(emp.basicSalary);
  const calendarDaily = (emp.basicSalary * 12) / 365;

  const noticePayInLieu =
    input.waiveShortfall || shortfallDays === 0
      ? 0
      : input.type === "RESIGNATION"
        ? -round2(calendarDaily * shortfallDays) // employee indemnifies employer
        : round2(calendarDaily * shortfallDays); // employer pays in lieu

  const tb = terminationBenefit(emp.basicSalary, emp.joinDate, input.lastWorkingDate);
  const benefit = ["RETRENCHMENT", "TERMINATION"].includes(input.type) && tb.eligible ? tb.amount : 0;

  const leaveDays = await unusedAnnualLeave(ctx.tenantId, emp.id, input.lastWorkingDate);
  const leaveEncashAmount = round2(leaveDays * dailyRate);

  return {
    employee: emp,
    serviceYears: round2(years),
    requiredNoticeDays,
    servedDays,
    shortfallDays,
    noticePayInLieu,
    terminationBenefit: benefit,
    terminationBenefitDaysPerYear: tb.daysPerYear,
    coveredByEA: tb.coveredByEA,
    leaveEncashDays: leaveDays,
    leaveEncashAmount,
    dailyRate: round2(dailyRate),
  };
}

export async function createSeparation(ctx: Ctx, input: SeparationInput) {
  const own = ctx.employeeId === input.employeeId && input.type === "RESIGNATION";
  if (!own) assertCan(ctx, "lifecycle.manage");
  const open = await prisma.separation.findFirst({ where: { employeeId: input.employeeId, status: { in: ["PENDING", "APPROVED"] } } });
  if (open) throw new DomainError("There's already an open separation for this employee.");
  const p = await previewSeparation(ctx, input);
  if (["RESIGNED", "TERMINATED", "RETIRED"].includes(p.employee.status)) throw new DomainError("Employee has already left.");

  const sep = await prisma.separation.create({
    data: {
      tenantId: ctx.tenantId,
      employeeId: input.employeeId,
      type: input.type,
      noticeDate: input.noticeDate,
      lastWorkingDate: input.lastWorkingDate,
      requiredNoticeDays: p.requiredNoticeDays,
      shortfallDays: p.shortfallDays,
      reason: input.reason ?? null,
      terminationBenefit: p.terminationBenefit,
      leaveEncashDays: p.leaveEncashDays,
      leaveEncashAmount: p.leaveEncashAmount,
      noticePayInLieu: p.noticePayInLieu,
      status: "PENDING",
    },
  });
  await audit(ctx, "CREATE", "Separation", sep.id, `${input.type} recorded for ${p.employee.fullName}, LWD ${input.lastWorkingDate.toISOString().slice(0, 10)}`);
  return sep;
}

export async function approveSeparation(ctx: Ctx, id: string) {
  assertCan(ctx, "lifecycle.manage");
  const sep = await prisma.separation.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { employee: true } });
  if (!sep) throw new DomainError("Separation not found.");
  if (sep.status !== "PENDING") throw new DomainError("Only pending separations can be approved.");
  await prisma.separation.update({ where: { id }, data: { status: "APPROVED" } });
  await prisma.employee.update({
    where: { id: sep.employeeId },
    data: { status: "NOTICE", resignDate: sep.noticeDate, lastWorkingDate: sep.lastWorkingDate },
  });
  await createChecklistFromTemplate(ctx, sep.employeeId, "OFFBOARDING", sep.lastWorkingDate);
  await notifyEmployee(sep.employeeId, "Your separation has been acknowledged", `Last working day: ${sep.lastWorkingDate.toISOString().slice(0, 10)}`, "/me");
  await audit(ctx, "APPROVE", "Separation", id, `Approved separation of ${sep.employee.fullName}`);
}

export async function withdrawSeparation(ctx: Ctx, id: string) {
  const sep = await prisma.separation.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!sep) throw new DomainError("Separation not found.");
  if (ctx.employeeId !== sep.employeeId) assertCan(ctx, "lifecycle.manage");
  if (!["PENDING", "APPROVED"].includes(sep.status)) throw new DomainError("This separation can no longer be withdrawn.");
  await prisma.separation.update({ where: { id }, data: { status: "WITHDRAWN" } });
  const emp = await prisma.employee.findUniqueOrThrow({ where: { id: sep.employeeId } });
  if (emp.status === "NOTICE") {
    await prisma.employee.update({
      where: { id: sep.employeeId },
      data: { status: emp.confirmationDate && emp.confirmationDate <= todayMY() ? "ACTIVE" : "PROBATION", resignDate: null, lastWorkingDate: null },
    });
  }
  await audit(ctx, "UPDATE", "Separation", id, "Separation withdrawn");
}

const FINAL_STATUS: Record<string, string> = {
  RESIGNATION: "RESIGNED",
  TERMINATION: "TERMINATED",
  RETRENCHMENT: "TERMINATED",
  RETIREMENT: "RETIRED",
  END_OF_CONTRACT: "RESIGNED",
  MUTUAL: "RESIGNED",
  DEATH: "TERMINATED",
};

/**
 * Completes a separation: requires the last working day to have passed, all company assets returned,
 * and CP22A submitted (for taxable employees). Deactivates the login.
 */
export async function completeSeparation(ctx: Ctx, id: string, opts: { exitInterview?: string; rehireEligible?: boolean; today?: Date } = {}) {
  assertCan(ctx, "lifecycle.manage");
  const sep = await prisma.separation.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { employee: { include: { assets: true } } } });
  if (!sep) throw new DomainError("Separation not found.");
  if (sep.status !== "APPROVED") throw new DomainError("Approve the separation before completing it.");
  const today = opts.today ?? todayMY();
  if (sep.lastWorkingDate > today) throw new DomainError("You can complete this after the last working day.");
  const unreturned = sep.employee.assets.filter((a) => a.status === "ASSIGNED");
  if (unreturned.length) throw new DomainError(`${unreturned.length} company asset(s) haven't been returned yet.`);
  if (!sep.cp22aSubmitted && sep.type !== "DEATH") throw new DomainError("Mark CP22A as submitted to LHDN before completing.");

  await prisma.separation.update({
    where: { id },
    data: { status: "COMPLETED", exitInterview: opts.exitInterview ?? sep.exitInterview, rehireEligible: opts.rehireEligible ?? sep.rehireEligible },
  });
  await prisma.employee.update({ where: { id: sep.employeeId }, data: { status: FINAL_STATUS[sep.type] ?? "RESIGNED" } });
  await prisma.employmentHistory.create({
    data: { employeeId: sep.employeeId, effectiveDate: sep.lastWorkingDate, type: "SEPARATED", title: `Left the company (${sep.type.toLowerCase().replace(/_/g, " ")})` },
  });
  await prisma.user.updateMany({ where: { employeeId: sep.employeeId }, data: { active: false } });
  await audit(ctx, "UPDATE", "Separation", id, `Completed separation of ${sep.employee.fullName}`);
}

export async function markCp22a(ctx: Ctx, id: string) {
  assertCan(ctx, "lifecycle.manage");
  const sep = await prisma.separation.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!sep) throw new DomainError("Separation not found.");
  await prisma.separation.update({ where: { id }, data: { cp22aSubmitted: true } });
}

/**
 * Posts the final settlement to the payroll of the last working month: leave encashment, termination benefit,
 * notice pay (or the employee's notice indemnity as a deduction), and full recovery of outstanding loans.
 */
export async function postFinalSettlement(ctx: Ctx, id: string) {
  assertCan(ctx, "lifecycle.manage");
  const sep = await prisma.separation.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { employee: true } });
  if (!sep) throw new DomainError("Separation not found.");
  if (!["APPROVED", "COMPLETED"].includes(sep.status)) throw new DomainError("Approve the separation first.");
  if (sep.settlementPeriod) throw new DomainError(`Final settlement was already posted to ${sep.settlementPeriod}.`);
  const period = periodOf(sep.lastWorkingDate);
  const finalRun = await prisma.payrollRun.findFirst({ where: { companyId: sep.employee.companyId, period, status: { in: ["APPROVED", "PAID", "LOCKED"] } } });
  if (finalRun) throw new DomainError(`Payroll for ${period} is already ${finalRun.status.toLowerCase()}. Reopen it or post manually.`);

  const items = await prisma.payItem.findMany({ where: { tenantId: ctx.tenantId, code: { in: ["LEAVE_ENCASH", "TERM_BENEFIT", "NOTICE_PAY", "DED_OTHER"] } } });
  const item = (code: string) => {
    const it = items.find((i) => i.code === code);
    if (!it) throw new DomainError(`Pay item ${code} is missing.`);
    return it.id;
  };
  const lines: { payItemId: string; amount: number; note: string }[] = [];
  if (sep.leaveEncashAmount > 0) lines.push({ payItemId: item("LEAVE_ENCASH"), amount: sep.leaveEncashAmount, note: `Unused annual leave (${sep.leaveEncashDays} days)` });
  if (sep.terminationBenefit > 0) lines.push({ payItemId: item("TERM_BENEFIT"), amount: sep.terminationBenefit, note: "Termination benefit (EA regulations)" });
  if (sep.noticePayInLieu > 0) lines.push({ payItemId: item("NOTICE_PAY"), amount: sep.noticePayInLieu, note: `Notice pay in lieu (${sep.shortfallDays} days)` });
  if (sep.noticePayInLieu < 0) lines.push({ payItemId: item("DED_OTHER"), amount: -sep.noticePayInLieu, note: `Notice shortfall indemnity (${sep.shortfallDays} days)` });
  for (const l of lines) await prisma.payrollAdjustment.create({ data: { tenantId: ctx.tenantId, employeeId: sep.employeeId, period, ...l } });

  // Recover remaining loan balances in the final payroll.
  const loans = await prisma.loan.findMany({ where: { employeeId: sep.employeeId, status: "ACTIVE", balance: { gt: 0 } } });
  for (const loan of loans) await prisma.loan.update({ where: { id: loan.id }, data: { installment: loan.balance, startPeriod: loan.startPeriod > period ? period : loan.startPeriod } });

  await prisma.separation.update({ where: { id }, data: { settlementPeriod: period } });
  await audit(ctx, "UPDATE", "Separation", id, `Posted final settlement for ${sep.employee.fullName} to ${period} payroll (${lines.length} item(s), ${loans.length} loan(s) recovered)`);
  return { period, lines: lines.length, loans: loans.length };
}

export async function createChecklistTemplate(ctx: Ctx, name: string, type: "ONBOARDING" | "OFFBOARDING") {
  assertCan(ctx, "lifecycle.manage");
  if (name.trim().length < 3) throw new DomainError("Name the template.");
  return prisma.checklistTemplate.create({ data: { tenantId: ctx.tenantId, name: name.trim(), type } });
}

export async function addTemplateItem(ctx: Ctx, templateId: string, input: { title: string; owner: string; dueOffsetDays: number }) {
  assertCan(ctx, "lifecycle.manage");
  const t = await prisma.checklistTemplate.findFirst({ where: { id: templateId, tenantId: ctx.tenantId }, include: { items: true } });
  if (!t) throw new DomainError("Template not found.");
  if (!input.title.trim()) throw new DomainError("Task title is required.");
  if (Math.abs(input.dueOffsetDays) > 365) throw new DomainError("Due offset must be within ±365 days.");
  return prisma.checklistTemplateItem.create({ data: { templateId, title: input.title.trim(), owner: input.owner, dueOffsetDays: input.dueOffsetDays, sortOrder: t.items.length } });
}

export async function removeTemplateItem(ctx: Ctx, itemId: string) {
  assertCan(ctx, "lifecycle.manage");
  const it = await prisma.checklistTemplateItem.findUnique({ where: { id: itemId }, include: { template: true } });
  if (!it || it.template.tenantId !== ctx.tenantId) throw new DomainError("Item not found.");
  await prisma.checklistTemplateItem.delete({ where: { id: itemId } });
}
