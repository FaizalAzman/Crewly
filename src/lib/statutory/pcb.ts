/**
 * PCB / MTD — Monthly Tax Deduction, Income Tax (Deduction from Remuneration) Rules 1994.
 * Implements LHDN "Computerised Calculation Method" (formula unchanged for 2026).
 *
 * MTD for current month = [ (P − M) × R + B − (Z + X) ] / (n + 1)
 *
 * P = [ Σ(Y − K) + (Y1 − K1) + (Y2 − K2) × n + (Yt − Kt) ] − (D + S + DU + SU + QC + ΣLP + LP1)
 */

export const RELIEF = {
  individual: 9000, // D
  spouse: 4000, // S (spouse with no income / joint assessment)
  disabledSelf: 7000, // DU (YA2025 onwards)
  disabledSpouse: 6000, // SU (YA2025 onwards)
  childUnder18: 2000,
  childHigherEducation: 8000,
  childDisabled: 8000,
  childDisabledStudying: 16000,
  epfCap: 4000,
  socsoEisCap: 350,
};

/** Resident individual tax schedule, YA2023 onwards. */
export const TAX_BANDS: { from: number; to: number; rate: number; taxAtFrom: number }[] = [
  { from: 0, to: 5000, rate: 0, taxAtFrom: 0 },
  { from: 5000, to: 20000, rate: 0.01, taxAtFrom: 0 },
  { from: 20000, to: 35000, rate: 0.03, taxAtFrom: 150 },
  { from: 35000, to: 50000, rate: 0.06, taxAtFrom: 600 },
  { from: 50000, to: 70000, rate: 0.11, taxAtFrom: 1500 },
  { from: 70000, to: 100000, rate: 0.19, taxAtFrom: 3700 },
  { from: 100000, to: 400000, rate: 0.25, taxAtFrom: 9400 },
  { from: 400000, to: 600000, rate: 0.26, taxAtFrom: 84400 },
  { from: 600000, to: 2000000, rate: 0.28, taxAtFrom: 136400 },
  { from: 2000000, to: Infinity, rate: 0.3, taxAtFrom: 528400 },
];

export type PcbCategory = 1 | 2 | 3;

/** Values of M, R and B for a chargeable income P and category. */
export function mrb(P: number, category: PcbCategory) {
  const band = TAX_BANDS.find((b) => P > b.from && P <= b.to) ?? TAX_BANDS[0];
  let B = band.taxAtFrom;
  // Rebates (RM400 individual, + RM400 spouse for category 2) apply when chargeable income ≤ RM35,000.
  if (P > 5000 && P <= 35000) B -= category === 2 ? 800 : 400;
  return { M: band.from, R: band.rate, B };
}

/** Annual tax on chargeable income (resident), after rebates. */
export function annualTax(chargeable: number, category: PcbCategory): number {
  if (chargeable <= 5000) return 0;
  const { M, R, B } = mrb(chargeable, category);
  return Math.max(0, (chargeable - M) * R + B);
}

export function pcbCategory(maritalStatus: string, spouseWorking: boolean, children: number): PcbCategory {
  if (maritalStatus === "MARRIED") return spouseWorking ? 3 : 2;
  if (maritalStatus === "DIVORCED" || maritalStatus === "WIDOWED") return 3;
  return children > 0 ? 3 : 1;
}

export interface ChildInfo {
  age: number;
  studying: boolean; // diploma and above, or A-level/matriculation in Malaysia
  disabled: boolean;
}

export function childReliefTotal(children: ChildInfo[]): number {
  return children.reduce((sum, c) => {
    if (c.disabled) return sum + (c.studying && c.age >= 18 ? RELIEF.childDisabledStudying : RELIEF.childDisabled);
    if (c.age < 18) return sum + RELIEF.childUnder18;
    if (c.studying) return sum + RELIEF.childHigherEducation;
    return sum;
  }, 0);
}

export interface PcbInput {
  /** 1 – 12 */
  month: number;
  resident: boolean;
  category: PcbCategory;
  disabledSelf?: boolean;
  disabledSpouse?: boolean;
  /** Total child relief in RM (see childReliefTotal). */
  childRelief?: number;
  /** Accumulated normal remuneration for previous months of the year (incl. TP3 prior employer). */
  Y: number;
  /** Accumulated EPF (employee) on Y. */
  K: number;
  /** Current month normal remuneration. */
  Y1: number;
  /** Current month EPF (employee) on Y1. */
  K1: number;
  /** Current month additional remuneration (bonus, arrears, commission paid irregularly…). */
  Yt?: number;
  /** EPF (employee) on Yt. */
  Kt?: number;
  /** Accumulated other deductions (TP1 reliefs) claimed in previous months. */
  LP?: number;
  /** Current month other deductions (TP1 reliefs + SOCSO/EIS). */
  LP1?: number;
  /** Accumulated zakat paid previous months. */
  Z?: number;
  /** Accumulated MTD paid previous months. */
  X?: number;
  /** Zakat paid in current month (deducted from MTD). */
  zakatCurrent?: number;
}

export interface PcbResult {
  normal: number;
  additional: number;
  total: number;
  zakatOffset: number;
  netPayable: number;
  chargeableIncome: number;
  estimatedAnnualTax: number;
  breakdown: Record<string, number>;
}

function roundUp5Sen(v: number): number {
  if (v <= 0) return 0;
  return Math.ceil(Math.round(v * 10000) / 10000 * 20) / 20;
}

export function calcPcb(input: PcbInput): PcbResult {
  const Yt = input.Yt ?? 0;
  const zakatCurrent = input.zakatCurrent ?? 0;

  if (!input.resident) {
    const tax = roundUp5Sen((input.Y1 + Yt) * 0.3);
    const net = Math.max(0, roundUp5Sen(tax - zakatCurrent));
    return {
      normal: roundUp5Sen(input.Y1 * 0.3),
      additional: roundUp5Sen(Yt * 0.3),
      total: tax,
      zakatOffset: Math.min(tax, zakatCurrent),
      netPayable: net,
      chargeableIncome: input.Y1 + Yt,
      estimatedAnnualTax: tax * 12,
      breakdown: { rate: 30 },
    };
  }

  const n = 12 - input.month;
  const cap = RELIEF.epfCap;
  const K = Math.min(input.K, cap);
  const K1 = Math.min(input.K1, Math.max(0, cap - K));
  const K2 = n > 0 ? Math.min(K1, Math.max(0, (cap - (K + K1)) / n)) : 0;
  const Y2 = input.Y1;

  const D = RELIEF.individual;
  const S = input.category === 2 ? RELIEF.spouse : 0;
  const DU = input.disabledSelf ? RELIEF.disabledSelf : 0;
  const SU = input.category === 2 && input.disabledSpouse ? RELIEF.disabledSpouse : 0;
  const QC = input.childRelief ?? 0;
  const LP = input.LP ?? 0;
  const LP1 = input.LP1 ?? 0;
  const Z = input.Z ?? 0;
  const X = input.X ?? 0;
  const reliefs = D + S + DU + SU + QC + LP + LP1;

  // --- Normal remuneration ---
  const Pn = Math.max(0, input.Y - K + (input.Y1 - K1) + (Y2 - K2) * n - reliefs);
  const a = mrb(Pn, input.category);
  let normal = Pn <= 5000 ? 0 : ((Pn - a.M) * a.R + a.B - (Z + X)) / (n + 1);
  normal = Math.max(0, normal);
  normal = roundUp5Sen(normal);

  // --- Additional remuneration ---
  let additional = 0;
  let annual = annualTax(Pn, input.category);
  if (Yt > 0) {
    const Kt = Math.min(input.Kt ?? 0, Math.max(0, cap - (K + K1 + K2 * n)));
    const Pa = Math.max(0, Pn + (Yt - Kt));
    const totalTax = annualTax(Pa, input.category);
    annual = totalTax;
    additional = Math.max(0, totalTax - (Z + X + normal * (n + 1)));
    additional = roundUp5Sen(additional);
  }

  let total = normal + additional;
  // MTD below RM10 need not be deducted.
  if (total < 10) {
    total = 0;
    normal = 0;
    additional = 0;
  }
  const zakatOffset = Math.min(total, zakatCurrent);
  const netPayable = roundUp5Sen(Math.max(0, total - zakatCurrent));

  return {
    normal,
    additional,
    total: Math.round(total * 100) / 100,
    zakatOffset,
    netPayable,
    chargeableIncome: Math.round(Pn * 100) / 100,
    estimatedAnnualTax: Math.round(annual * 100) / 100,
    breakdown: { n, K, K1, K2, D, S, DU, SU, QC, LP, LP1, Z, X, M: a.M, R: a.R, B: a.B },
  };
}
