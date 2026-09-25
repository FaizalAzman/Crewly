import { prisma } from "@/lib/db";
import { computePayslip, type EngineLine, type YearToDate } from "@/lib/payroll/engine";
import { hrdfRate } from "@/lib/statutory/hrdf";
import { countWorkingDays } from "@/lib/calendar";
import { parsePeriod, periodOf, round2, shiftPeriod } from "@/lib/utils";
import type { Citizenship } from "@/lib/statutory/epf";
import { assertCan, audit, notifyEmployee } from "../guard";
import { DomainError, ForbiddenError, type Ctx } from "../types";
import { holidaySet, tenantWorkWeek } from "./holiday.service";

const FINAL = ["APPROVED", "PAID", "LOCKED"];

export async function createPayrollRun(ctx: Ctx, input: { companyId: string; period: string; payDate: Date; notes?: string }) {
  assertCan(ctx, "payroll.manage");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period)) throw new DomainError("Period must be in YYYY-MM format.");
  const company = await prisma.company.findFirst({ where: { id: input.companyId, tenantId: ctx.tenantId } });
  if (!company) throw new DomainError("Company not found.");
  if (await prisma.payrollRun.findUnique({ where: { companyId_period: { companyId: input.companyId, period: input.period } } })) {
    throw new DomainError(`A payroll run for ${input.period} already exists for ${company.name}.`);
  }
  const { start } = parsePeriod(input.period);
  const later = await prisma.payrollRun.findFirst({ where: { companyId: input.companyId, period: { gt: input.period }, status: { in: FINAL } } });
  if (later) throw new DomainError(`Can't create ${input.period}: a later period (${later.period}) is already finalised.`);
  if (input.payDate < start) throw new DomainError("Pay date can't be before the start of the period.");
  const run = await prisma.payrollRun.create({
    data: { tenantId: ctx.tenantId, companyId: input.companyId, period: input.period, payDate: input.payDate, notes: input.notes, createdById: ctx.userId },
  });
  await audit(ctx, "CREATE", "PayrollRun", run.id, `Created payroll ${input.period} for ${company.name}`);
  return run;
}

async function loadRun(ctx: Ctx, runId: string) {
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, tenantId: ctx.tenantId }, include: { company: true } });
  if (!run) throw new DomainError("Payroll run not found.");
  return run;
}

/** YTD figures for PCB from finalised payslips earlier in the same year, plus TP3 (previous employer). */
export async function yearToDate(employeeId: string, period: string): Promise<YearToDate> {
  const year = period.slice(0, 4);
  const slips = await prisma.payslip.findMany({
    where: { employeeId, period: { gte: `${year}-01`, lt: period }, run: { status: { in: FINAL } } },
  });
  const tp3 = await prisma.taxDeclaration.findUnique({ where: { employeeId_year: { employeeId, year: Number(year) } } });
  const s = (f: (p: (typeof slips)[number]) => number) => round2(slips.reduce((a, p) => a + f(p), 0));
  return {
    Y: round2(s((p) => p.pcbY1 + p.pcbYt) + (tp3?.prevGross ?? 0)),
    K: round2(s((p) => p.epfEE) + (tp3?.prevEpf ?? 0)),
    X: round2(s((p) => p.pcb) + (tp3?.prevPcb ?? 0)),
    Z: round2(s((p) => p.zakat) + (tp3?.prevZakat ?? 0)),
    LP: s((p) => p.lpUsed),
    socsoEisRelief: s((p) => p.socsoEisRelief),
  };
}

export function tp1Total(t: Record<string, unknown> | null): number {
  if (!t) return 0;
  const caps: Record<string, number> = {
    lifestyle: 2500, medicalSelf: 10000, medicalParents: 8000, education: 7000, lifeInsurance: 3000,
    educationMedicalInsurance: 4000, prs: 3000, sspn: 8000, childcare: 3000, breastfeeding: 1000, sports: 1000,
    evCharging: 2500, housingLoanInterest: 7000, vaccination: 1000,
  };
  return round2(Object.entries(caps).reduce((sum, [k, cap]) => sum + Math.min(Number(t[k] ?? 0), cap), 0));
}

/** Employees in scope for a run: employed at any point in the period, in this company. */
async function employeesForRun(tenantId: string, companyId: string, period: string) {
  const { start, end } = parsePeriod(period);
  return prisma.employee.findMany({
    where: {
      tenantId,
      companyId,
      joinDate: { lte: end },
      OR: [{ lastWorkingDate: null }, { lastWorkingDate: { gte: start } }],
      NOT: { status: { in: ["RESIGNED", "TERMINATED", "RETIRED"] }, lastWorkingDate: null },
    },
    include: { children: true, payItems: { include: { payItem: true } }, branch: true },
    orderBy: { employeeNo: "asc" },
  });
}

export async function calculatePayrollRun(ctx: Ctx, runId: string) {
  assertCan(ctx, "payroll.manage");
  const run = await loadRun(ctx, runId);
  if (!["DRAFT", "CALCULATED"].includes(run.status)) throw new DomainError(`Can't recalculate a ${run.status.toLowerCase()} run.`);

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } });
  const workWeek = await tenantWorkWeek(ctx.tenantId);
  const { start, end, year } = parsePeriod(run.period);
  const employees = await employeesForRun(ctx.tenantId, run.companyId, run.period);
  const basicItem = await prisma.payItem.findFirst({ where: { tenantId: ctx.tenantId, code: "BASIC" } });
  const malaysians = await prisma.employee.count({
    where: { tenantId: ctx.tenantId, companyId: run.companyId, citizenship: "CITIZEN", status: { in: ["ACTIVE", "PROBATION", "NOTICE"] } },
  });
  const rate = hrdfRate(malaysians, run.company.hrdfOptIn);

  // Release anything reserved by a previous calculation of this run.
  await prisma.claim.updateMany({ where: { payrollRunId: run.id, status: "APPROVED" }, data: { payrollRunId: null } });
  await prisma.overtimeRequest.updateMany({ where: { payrollRunId: run.id, status: "APPROVED" }, data: { payrollRunId: null } });
  await prisma.payslip.deleteMany({ where: { runId: run.id } });

  const holidayCache = new Map<string, Set<string>>();
  const totals = { gross: 0, net: 0, cost: 0, epfEE: 0, epfER: 0, socsoEE: 0, socsoER: 0, eisEE: 0, eisER: 0, pcb: 0, zakat: 0, hrdf: 0 };
  let count = 0;
  const warnings: string[] = [];

  for (const e of employees) {
    const state = e.branch?.state ?? run.company.state ?? e.state;
    if (!holidayCache.has(state)) holidayCache.set(state, await holidaySet(ctx.tenantId, state, start, end));
    const holidays = holidayCache.get(state)!;

    const recurring: EngineLine[] = e.payItems
      .filter((pi) => pi.payItem.active && (!pi.startDate || pi.startDate <= end) && (!pi.endDate || pi.endDate >= start))
      .map((pi) => ({ ...flags(pi.payItem), amount: pi.amount, prorate: pi.payItem.category === "ALLOWANCE" }));

    const adjustments: EngineLine[] = (
      await prisma.payrollAdjustment.findMany({ where: { employeeId: e.id, period: run.period }, include: { payItem: true } })
    ).map((a) => ({ ...flags(a.payItem), name: a.note ? `${a.payItem.name} — ${a.note}` : a.payItem.name, amount: a.amount }));

    // Unpaid leave working days that fall within the period.
    const unpaid = await prisma.leaveRequest.findMany({
      where: { employeeId: e.id, status: "APPROVED", leaveType: { paid: false }, startDate: { lte: end }, endDate: { gte: start } },
    });
    let unpaidDays = 0;
    for (const u of unpaid) {
      if (u.halfDay) unpaidDays += 0.5;
      else unpaidDays += countWorkingDays(u.startDate > start ? u.startDate : start, u.endDate < end ? u.endDate : end, workWeek, holidays);
    }

    const ot = await prisma.overtimeRequest.findMany({ where: { employeeId: e.id, status: "APPROVED", payrollRunId: null, date: { lte: end } } });
    const claims = await prisma.claim.findMany({
      where: { employeeId: e.id, status: "APPROVED", payrollRunId: null, date: { lte: end } },
      include: { claimType: true },
    });
    const loans = await prisma.loan.findMany({ where: { employeeId: e.id, status: "ACTIVE", startPeriod: { lte: run.period }, balance: { gt: 0 } } });
    const ytd = await yearToDate(e.id, run.period);
    const tp = await prisma.taxDeclaration.findUnique({ where: { employeeId_year: { employeeId: e.id, year } } });

    const r = computePayslip({
      period: run.period,
      employee: { ...e, citizenship: e.citizenship as Citizenship },
      workWeek,
      holidays,
      unpaidLeaveBasis: tenant.unpaidLeaveBasis as "WORKING_DAYS",
      basicItem: basicItem ?? undefined,
      recurring,
      adjustments,
      unpaidLeaveDays: unpaidDays,
      overtimeAmount: round2(ot.reduce((s, o) => s + o.amount, 0)),
      claims: claims.map((c) => ({ amount: c.amount, taxable: c.claimType.taxable })),
      loans: loans.map((l) => ({ loanId: l.id, amount: l.installment, balance: l.balance })),
      ytd,
      tp1Total: tp1Total(tp as unknown as Record<string, unknown>),
      hrdfRate: rate,
    });
    if (!r.employed) continue;

    await prisma.payslip.create({
      data: {
        tenantId: ctx.tenantId,
        runId: run.id,
        employeeId: e.id,
        period: run.period,
        basicSalary: r.basicSalary,
        proratedBasic: r.proratedBasic,
        workingDays: r.workingDays,
        daysPaid: r.daysPaid,
        unpaidLeaveDays: r.unpaidLeaveDays,
        unpaidLeaveDeduction: r.unpaidLeaveDeduction,
        totalEarnings: r.totalEarnings,
        grossPay: r.grossPay,
        epfWages: r.epfWages,
        socsoWages: r.socsoWages,
        pcbNormal: r.pcbNormal,
        pcbAdditional: r.pcbAdditional,
        pcbY1: r.pcbY1,
        pcbYt: r.pcbYt,
        lpUsed: r.lpUsed,
        socsoEisRelief: r.socsoEisReliefUsed,
        epfEE: r.epfEE,
        epfER: r.epfER,
        socsoEE: r.socsoEE,
        socsoER: r.socsoER,
        eisEE: r.eisEE,
        eisER: r.eisER,
        pcb: r.pcb,
        zakat: r.zakat,
        hrdf: r.hrdf,
        otherDeductions: r.otherDeductions,
        totalDeductions: r.totalDeductions,
        netPay: r.netPay,
        employerCost: r.employerCost,
        warnings: r.warnings.length ? r.warnings.join(" | ") : null,
        lines: { create: r.lines.map((l, i) => ({ ...l, sortOrder: i })) },
      },
    });
    if (ot.length) await prisma.overtimeRequest.updateMany({ where: { id: { in: ot.map((o) => o.id) } }, data: { payrollRunId: run.id } });
    if (claims.length) await prisma.claim.updateMany({ where: { id: { in: claims.map((c) => c.id) } }, data: { payrollRunId: run.id } });
    for (const w of r.warnings) warnings.push(`${e.fullName}: ${w}`);

    count++;
    totals.gross += r.grossPay;
    totals.net += r.netPay;
    totals.cost += r.employerCost;
    totals.epfEE += r.epfEE;
    totals.epfER += r.epfER;
    totals.socsoEE += r.socsoEE;
    totals.socsoER += r.socsoER;
    totals.eisEE += r.eisEE;
    totals.eisER += r.eisER;
    totals.pcb += r.pcb;
    totals.zakat += r.zakat;
    totals.hrdf += r.hrdf;
  }

  const updated = await prisma.payrollRun.update({
    where: { id: run.id },
    data: {
      status: "CALCULATED",
      headcount: count,
      totalGross: round2(totals.gross),
      totalNet: round2(totals.net),
      totalEmployerCost: round2(totals.cost),
      totalEpfEE: round2(totals.epfEE),
      totalEpfER: round2(totals.epfER),
      totalSocsoEE: round2(totals.socsoEE),
      totalSocsoER: round2(totals.socsoER),
      totalEisEE: round2(totals.eisEE),
      totalEisER: round2(totals.eisER),
      totalPcb: round2(totals.pcb),
      totalZakat: round2(totals.zakat),
      totalHrdf: round2(totals.hrdf),
    },
  });
  await audit(ctx, "UPDATE", "PayrollRun", run.id, `Calculated payroll ${run.period}: ${count} employees, net RM${round2(totals.net)}`);
  return { run: updated, warnings };
}

function flags(p: { code: string; name: string; kind: string; epf: boolean; socso: boolean; eis: boolean; pcb: boolean; hrdf: boolean; additional: boolean }) {
  return {
    code: p.code,
    name: p.name,
    kind: p.kind as "EARNING" | "DEDUCTION",
    epf: p.epf,
    socso: p.socso,
    eis: p.eis,
    pcb: p.pcb,
    hrdf: p.hrdf,
    additional: p.additional,
  };
}

/**
 * Approve — maker-checker: the person who created/calculated the run cannot approve it (owners excepted).
 * The previous month's run (if any) must be finalised first so YTD tax figures are correct.
 */
export async function approvePayrollRun(ctx: Ctx, runId: string) {
  assertCan(ctx, "payroll.approve");
  const run = await loadRun(ctx, runId);
  if (run.status !== "CALCULATED") throw new DomainError("Only calculated runs can be approved.");
  if (run.createdById === ctx.userId && ctx.role !== "OWNER") throw new ForbiddenError("Maker-checker: someone other than the preparer must approve this run.");
  const prev = await prisma.payrollRun.findUnique({ where: { companyId_period: { companyId: run.companyId, period: shiftPeriod(run.period, -1) } } });
  if (prev && !FINAL.includes(prev.status)) throw new DomainError(`Finalise ${prev.period} before approving ${run.period}.`);
  const slips = await prisma.payslip.count({ where: { runId } });
  if (slips === 0) throw new DomainError("This run has no payslips.");
  const updated = await prisma.payrollRun.update({ where: { id: runId }, data: { status: "APPROVED", approvedById: ctx.userId, approvedAt: new Date() } });
  await audit(ctx, "APPROVE", "PayrollRun", runId, `Approved payroll ${run.period}`);
  return updated;
}

/** Mark as paid: settles claims & OT, posts loan repayments, and notifies employees their payslip is ready. */
export async function markPayrollPaid(ctx: Ctx, runId: string) {
  assertCan(ctx, "payroll.approve");
  const run = await loadRun(ctx, runId);
  if (run.status !== "APPROVED") throw new DomainError("Approve the run before marking it paid.");
  await prisma.claim.updateMany({ where: { payrollRunId: runId }, data: { status: "PAID" } });
  await prisma.overtimeRequest.updateMany({ where: { payrollRunId: runId }, data: { status: "PAID" } });
  const loanLines = await prisma.payslipLine.findMany({ where: { payslip: { runId }, code: { startsWith: "LOAN:" } } });
  for (const line of loanLines) {
    const loanId = line.code.slice(5);
    const loan = await prisma.loan.findUnique({ where: { id: loanId } });
    if (!loan) continue;
    const balance = round2(Math.max(0, loan.balance - line.amount));
    await prisma.loanRepayment.create({ data: { loanId, period: run.period, amount: line.amount, runId } });
    await prisma.loan.update({ where: { id: loanId }, data: { balance, status: balance === 0 ? "SETTLED" : "ACTIVE" } });
  }
  const updated = await prisma.payrollRun.update({ where: { id: runId }, data: { status: "PAID", paidAt: new Date() } });
  const slips = await prisma.payslip.findMany({ where: { runId }, select: { employeeId: true, id: true } });
  for (const s of slips) await notifyEmployee(s.employeeId, `Your payslip for ${run.period} is ready 💸`, undefined, `/me/payslips/${s.id}`);
  await audit(ctx, "UPDATE", "PayrollRun", runId, `Marked payroll ${run.period} as paid`);
  return updated;
}

export async function lockPayrollRun(ctx: Ctx, runId: string) {
  assertCan(ctx, "payroll.approve");
  const run = await loadRun(ctx, runId);
  if (run.status !== "PAID") throw new DomainError("Only paid runs can be locked.");
  return prisma.payrollRun.update({ where: { id: runId }, data: { status: "LOCKED" } });
}

export async function reopenPayrollRun(ctx: Ctx, runId: string) {
  assertCan(ctx, "payroll.approve");
  const run = await loadRun(ctx, runId);
  if (run.status !== "APPROVED") throw new DomainError("Only approved (unpaid) runs can be reopened.");
  const later = await prisma.payrollRun.findFirst({ where: { companyId: run.companyId, period: { gt: run.period }, status: { in: FINAL } } });
  if (later) throw new DomainError(`Can't reopen: ${later.period} is already finalised.`);
  await audit(ctx, "UPDATE", "PayrollRun", runId, `Reopened payroll ${run.period}`);
  return prisma.payrollRun.update({ where: { id: runId }, data: { status: "CALCULATED", approvedById: null, approvedAt: null } });
}

export async function deletePayrollRun(ctx: Ctx, runId: string) {
  assertCan(ctx, "payroll.manage");
  const run = await loadRun(ctx, runId);
  if (!["DRAFT", "CALCULATED"].includes(run.status)) throw new DomainError("Only draft or calculated runs can be deleted.");
  await prisma.claim.updateMany({ where: { payrollRunId: runId }, data: { payrollRunId: null } });
  await prisma.overtimeRequest.updateMany({ where: { payrollRunId: runId }, data: { payrollRunId: null } });
  await prisma.payrollRun.delete({ where: { id: runId } });
  await audit(ctx, "DELETE", "PayrollRun", runId, `Deleted payroll ${run.period}`);
}

export async function addAdjustment(ctx: Ctx, input: { employeeId: string; payItemId: string; period: string; amount: number; note?: string }) {
  assertCan(ctx, "payroll.manage");
  if (!input.amount) throw new DomainError("Amount can't be zero.");
  const [emp, item] = await Promise.all([
    prisma.employee.findFirst({ where: { id: input.employeeId, tenantId: ctx.tenantId } }),
    prisma.payItem.findFirst({ where: { id: input.payItemId, tenantId: ctx.tenantId } }),
  ]);
  if (!emp || !item) throw new DomainError("Employee or pay item not found.");
  if (item.system) throw new DomainError(`${item.name} is managed automatically.`);
  const locked = await prisma.payrollRun.findFirst({ where: { companyId: emp.companyId, period: input.period, status: { in: FINAL } } });
  if (locked) throw new DomainError(`Payroll for ${input.period} is already ${locked.status.toLowerCase()}.`);
  return prisma.payrollAdjustment.create({ data: { tenantId: ctx.tenantId, ...input, amount: round2(input.amount) } });
}

export function currentPeriod() {
  return periodOf(new Date());
}
