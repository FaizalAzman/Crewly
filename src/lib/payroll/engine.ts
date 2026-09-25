/**
 * Payroll engine — pure function computing one employee's payslip for a period.
 * No database access: the payroll service gathers inputs, this computes outputs.
 */
import { countCalendarDays, countWorkingDays, type WorkWeek } from "../calendar";
import { calcEpf, type Citizenship } from "../statutory/epf";
import { calcEis, calcSocso } from "../statutory/socso";
import { calcPcb, childReliefTotal, pcbCategory, RELIEF, type ChildInfo } from "../statutory/pcb";
import { MINIMUM_WAGE } from "../statutory/employment-act";
import { ageOn, parsePeriod, round2 } from "../utils";

export interface PayItemFlags {
  code: string;
  name: string;
  kind: "EARNING" | "DEDUCTION";
  epf: boolean;
  socso: boolean;
  eis: boolean;
  pcb: boolean;
  hrdf: boolean;
  additional: boolean;
  /** Pro-rate with basic for part-month joiners/leavers (fixed allowances). */
  prorate?: boolean;
}

export interface EngineLine extends PayItemFlags {
  amount: number;
}

export interface PayrollEmployee {
  id: string;
  basicSalary: number;
  joinDate: Date;
  lastWorkingDate: Date | null;
  dateOfBirth: Date | null;
  citizenship: Citizenship;
  maritalStatus: string;
  spouseWorking: boolean;
  spouseDisabled: boolean;
  disabled: boolean;
  taxResident: boolean;
  zakatMonthly: number;
  epfEmployeeRate: number | null;
  epfEmployerRate: number | null;
  hrdfApplicable: boolean;
  employmentType: string;
  children: { dateOfBirth: Date; studying: boolean; disabled: boolean }[];
}

export interface YearToDate {
  /** normal remuneration subject to PCB, previous months (incl. TP3 prior employer) */
  Y: number;
  /** EPF employee share on remuneration, previous months (incl. TP3) */
  K: number;
  /** PCB paid previous months (incl. TP3) */
  X: number;
  /** zakat paid previous months (incl. TP3) */
  Z: number;
  /** TP1 reliefs + SOCSO/EIS relief already used in previous months */
  LP: number;
  /** SOCSO+EIS employee contributions already claimed as relief this year */
  socsoEisRelief: number;
}

export interface EngineInput {
  period: string; // YYYY-MM
  employee: PayrollEmployee;
  workWeek: WorkWeek;
  holidays: Set<string>;
  unpaidLeaveBasis: "WORKING_DAYS" | "CALENDAR_DAYS" | "FIXED_26";
  basicItem?: Pick<PayItemFlags, "epf" | "socso" | "eis" | "pcb" | "hrdf">;
  recurring: EngineLine[];
  adjustments: EngineLine[];
  unpaidLeaveDays: number;
  overtimeAmount: number;
  claims: { amount: number; taxable: boolean }[];
  loans: { loanId: string; amount: number; balance: number }[];
  ytd: YearToDate;
  /** Total TP1 reliefs declared for the year */
  tp1Total: number;
  hrdfRate: number;
}

export interface PayslipLineOut {
  code: string;
  name: string;
  kind: "EARNING" | "DEDUCTION" | "EMPLOYER";
  amount: number;
}

export interface EngineResult {
  basicSalary: number;
  proratedBasic: number;
  workingDays: number;
  daysPaid: number;
  unpaidLeaveDays: number;
  unpaidLeaveDeduction: number;
  totalEarnings: number;
  grossPay: number;
  epfWages: number;
  socsoWages: number;
  hrdfWages: number;
  epfEE: number;
  epfER: number;
  socsoEE: number;
  socsoER: number;
  eisEE: number;
  eisER: number;
  pcb: number;
  pcbNormal: number;
  pcbAdditional: number;
  zakat: number;
  hrdf: number;
  otherDeductions: number;
  totalDeductions: number;
  netPay: number;
  employerCost: number;
  lines: PayslipLineOut[];
  /** PCB-relevant figures to accumulate into YTD. */
  pcbY1: number;
  pcbYt: number;
  lpUsed: number;
  socsoEisReliefUsed: number;
  warnings: string[];
  employed: boolean;
}

const DEFAULT_BASIC = { epf: true, socso: true, eis: true, pcb: true, hrdf: true };

export function computePayslip(input: EngineInput): EngineResult {
  const { employee: e, workWeek, holidays } = input;
  const { start, end, month, daysInMonth } = parsePeriod(input.period);
  const warnings: string[] = [];
  const bi = input.basicItem ?? DEFAULT_BASIC;
  // Only the statutory flags — never the pay item's own code/name.
  const basicFlags = { epf: bi.epf, socso: bi.socso, eis: bi.eis, pcb: bi.pcb, hrdf: bi.hrdf };

  // ── Employment window within the period ──
  const from = e.joinDate > start ? e.joinDate : start;
  const to = e.lastWorkingDate && e.lastWorkingDate < end ? e.lastWorkingDate : end;
  const employed = from <= to;

  const monthWorking = countWorkingDays(start, end, workWeek, holidays);
  let factor = 1;
  let daysPaid = monthWorking;
  if (!employed) {
    factor = 0;
    daysPaid = 0;
  } else if (from > start || to < end) {
    if (input.unpaidLeaveBasis === "CALENDAR_DAYS") {
      const d = countCalendarDays(from, to);
      factor = d / daysInMonth;
      daysPaid = d;
    } else {
      const d = countWorkingDays(from, to, workWeek, holidays);
      factor = input.unpaidLeaveBasis === "FIXED_26" ? Math.min(1, d / 26) : monthWorking ? d / monthWorking : 0;
      daysPaid = d;
    }
  }
  const proratedBasic = round2(e.basicSalary * factor);

  // ── Unpaid leave ──
  const dailyBasis = input.unpaidLeaveBasis === "CALENDAR_DAYS" ? daysInMonth : input.unpaidLeaveBasis === "FIXED_26" ? 26 : monthWorking || 26;
  const unpaidDays = Math.min(input.unpaidLeaveDays, daysPaid);
  const unpaidLeaveDeduction = round2(Math.min(proratedBasic, (e.basicSalary / dailyBasis) * unpaidDays));
  daysPaid = round2(daysPaid - unpaidDays);

  // ── Earnings ──
  const earnings: EngineLine[] = [];
  if (proratedBasic > 0) earnings.push({ code: "BASIC", name: "Basic Salary", kind: "EARNING", additional: false, ...basicFlags, amount: proratedBasic });
  if (unpaidLeaveDeduction > 0)
    earnings.push({ code: "UNPAID", name: `Unpaid leave (${unpaidDays} day${unpaidDays === 1 ? "" : "s"})`, kind: "EARNING", additional: false, ...basicFlags, amount: -unpaidLeaveDeduction });
  for (const r of input.recurring.filter((l) => l.kind === "EARNING")) {
    const amt = round2(r.prorate === false ? r.amount : r.amount * factor);
    if (amt) earnings.push({ ...r, amount: amt });
  }
  for (const a of input.adjustments.filter((l) => l.kind === "EARNING")) if (a.amount) earnings.push({ ...a, amount: round2(a.amount) });
  if (input.overtimeAmount > 0)
    earnings.push({ code: "OT", name: "Overtime", kind: "EARNING", epf: false, socso: true, eis: true, pcb: true, hrdf: false, additional: false, amount: round2(input.overtimeAmount) });
  const nonTaxClaims = round2(input.claims.filter((c) => !c.taxable).reduce((s, c) => s + c.amount, 0));
  const taxClaims = round2(input.claims.filter((c) => c.taxable).reduce((s, c) => s + c.amount, 0));
  if (nonTaxClaims > 0)
    earnings.push({ code: "CLAIM", name: "Claims reimbursement", kind: "EARNING", epf: false, socso: false, eis: false, pcb: false, hrdf: false, additional: false, amount: nonTaxClaims });
  if (taxClaims > 0)
    earnings.push({ code: "CLAIM_TAX", name: "Taxable claims / benefits", kind: "EARNING", epf: false, socso: false, eis: false, pcb: true, hrdf: false, additional: false, amount: taxClaims });

  const sum = (pred: (l: EngineLine) => boolean) => round2(earnings.filter(pred).reduce((s, l) => s + l.amount, 0));
  const grossPay = sum(() => true);
  const totalEarnings = round2(grossPay + unpaidLeaveDeduction);
  const epfWagesNormal = Math.max(0, sum((l) => l.epf && !l.additional));
  const epfWagesAdditional = Math.max(0, sum((l) => l.epf && l.additional));
  const epfWages = round2(epfWagesNormal + epfWagesAdditional);
  const socsoWages = Math.max(0, sum((l) => l.socso));
  const hrdfWages = Math.max(0, sum((l) => l.hrdf));
  const pcbY1 = Math.max(0, sum((l) => l.pcb && !l.additional));
  const pcbYt = Math.max(0, sum((l) => l.pcb && l.additional));

  // ── Statutory ──
  const age = ageOn(e.dateOfBirth, start);
  const epfArgs = { age, citizenship: e.citizenship, employeeRateOverride: e.epfEmployeeRate, employerRateOverride: e.epfEmployerRate };
  const epf = calcEpf({ wages: epfWages, ...epfArgs });
  const epfNormal = calcEpf({ wages: epfWagesNormal, ...epfArgs });
  const socso = calcSocso({ wages: socsoWages, age, citizenship: e.citizenship });
  const eis = calcEis({ wages: socsoWages, age, citizenship: e.citizenship });

  // ── PCB ──
  const K1 = Math.min(epfNormal.employee, epf.employee);
  const Kt = Math.max(0, epf.employee - K1);
  const socsoEisThisMonth = socso.employee + eis.employee;
  const socsoEisRelief = Math.max(0, Math.min(socsoEisThisMonth, RELIEF.socsoEisCap - input.ytd.socsoEisRelief));
  const tp1Remaining = Math.max(0, input.tp1Total - Math.max(0, input.ytd.LP - input.ytd.socsoEisRelief));
  const LP1 = round2(tp1Remaining + socsoEisRelief);
  const children: ChildInfo[] = e.children.map((c) => ({ age: ageOn(c.dateOfBirth, start), studying: c.studying, disabled: c.disabled }));
  const zakat = round2(e.zakatMonthly || 0);
  const pcbRes =
    grossPay > 0
      ? calcPcb({
          month,
          resident: e.taxResident,
          category: pcbCategory(e.maritalStatus, e.spouseWorking, children.length),
          disabledSelf: e.disabled,
          disabledSpouse: e.spouseDisabled,
          childRelief: childReliefTotal(children),
          Y: input.ytd.Y,
          K: input.ytd.K,
          Y1: pcbY1,
          K1,
          Yt: pcbYt,
          Kt,
          LP: input.ytd.LP,
          LP1,
          Z: input.ytd.Z,
          X: input.ytd.X,
          zakatCurrent: zakat,
        })
      : null;
  const pcb = pcbRes?.netPayable ?? 0;

  // ── HRD Corp levy (employer) ──
  const hrdf = e.hrdfApplicable && e.citizenship === "CITIZEN" ? round2(hrdfWages * input.hrdfRate) : 0;

  // ── Deductions ──
  const deductionLines: PayslipLineOut[] = [];
  if (epf.employee) deductionLines.push({ code: "EPF_EE", name: `EPF (${epf.employeeRate}%)`, kind: "DEDUCTION", amount: epf.employee });
  if (socso.employee) deductionLines.push({ code: "SOCSO_EE", name: "SOCSO", kind: "DEDUCTION", amount: socso.employee });
  if (eis.employee) deductionLines.push({ code: "EIS_EE", name: "EIS", kind: "DEDUCTION", amount: eis.employee });
  if (pcb) deductionLines.push({ code: "PCB", name: "PCB / MTD", kind: "DEDUCTION", amount: pcb });
  if (zakat && grossPay > 0) deductionLines.push({ code: "ZAKAT", name: "Zakat", kind: "DEDUCTION", amount: zakat });

  let otherDeductions = 0;
  for (const d of [...input.recurring, ...input.adjustments].filter((l) => l.kind === "DEDUCTION")) {
    if (!d.amount) continue;
    deductionLines.push({ code: d.code, name: d.name, kind: "DEDUCTION", amount: round2(d.amount) });
    otherDeductions += d.amount;
  }
  // Loans — never deduct more than the outstanding balance, nor push net pay below zero.
  const statutoryAndOther = round2(epf.employee + socso.employee + eis.employee + pcb + (grossPay > 0 ? zakat : 0) + otherDeductions);
  let headroom = round2(grossPay - statutoryAndOther);
  for (const l of input.loans) {
    const amt = round2(Math.max(0, Math.min(l.amount, l.balance, headroom)));
    if (amt <= 0) continue;
    deductionLines.push({ code: `LOAN:${l.loanId}`, name: "Loan / advance repayment", kind: "DEDUCTION", amount: amt });
    otherDeductions += amt;
    headroom = round2(headroom - amt);
  }
  otherDeductions = round2(otherDeductions);
  const totalDeductions = round2(deductionLines.reduce((s, l) => s + l.amount, 0));
  const netPay = round2(grossPay - totalDeductions);
  if (netPay < 0) warnings.push("Net pay is negative — review deductions.");

  // Employment Act s.24: total deductions (excluding statutory) should not exceed 50% of wages.
  if (grossPay > 0 && otherDeductions > grossPay * 0.5) warnings.push("Non-statutory deductions exceed 50% of wages (EA s.24(8)).");
  const fullTime = ["PERMANENT", "CONTRACT", "PROBATION"].includes(e.employmentType);
  if (fullTime && e.basicSalary < MINIMUM_WAGE) warnings.push(`Basic salary below minimum wage RM${MINIMUM_WAGE}.`);

  const employerLines: PayslipLineOut[] = [];
  if (epf.employer) employerLines.push({ code: "EPF_ER", name: `EPF employer (${epf.employerRate}%)`, kind: "EMPLOYER", amount: epf.employer });
  if (socso.employer) employerLines.push({ code: "SOCSO_ER", name: "SOCSO employer", kind: "EMPLOYER", amount: socso.employer });
  if (eis.employer) employerLines.push({ code: "EIS_ER", name: "EIS employer", kind: "EMPLOYER", amount: eis.employer });
  if (hrdf) employerLines.push({ code: "HRDF", name: "HRD Corp levy", kind: "EMPLOYER", amount: hrdf });

  const employerCost = round2(grossPay + epf.employer + socso.employer + eis.employer + hrdf);

  return {
    basicSalary: e.basicSalary,
    proratedBasic,
    workingDays: monthWorking,
    daysPaid,
    unpaidLeaveDays: unpaidDays,
    unpaidLeaveDeduction,
    totalEarnings,
    grossPay,
    epfWages,
    socsoWages,
    hrdfWages,
    epfEE: epf.employee,
    epfER: epf.employer,
    socsoEE: socso.employee,
    socsoER: socso.employer,
    eisEE: eis.employee,
    eisER: eis.employer,
    pcb,
    pcbNormal: pcbRes?.normal ?? 0,
    pcbAdditional: pcbRes?.additional ?? 0,
    zakat: grossPay > 0 ? zakat : 0,
    hrdf,
    otherDeductions,
    totalDeductions,
    netPay,
    employerCost,
    lines: [
      ...earnings.map((l) => ({ code: l.code, name: l.name, kind: "EARNING" as const, amount: l.amount })),
      ...deductionLines,
      ...employerLines,
    ],
    pcbY1,
    pcbYt,
    lpUsed: LP1,
    socsoEisReliefUsed: socsoEisRelief,
    warnings,
    employed,
  };
}
