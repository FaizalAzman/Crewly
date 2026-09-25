/**
 * Employment Act 1955 (as amended by the Employment (Amendment) Act 2022, in force 1 Jan 2023)
 * plus related minimum standards used across the product.
 */

export const MINIMUM_WAGE = 1700; // Minimum Wages Order 2024, effective 1 Feb 2025
export const EA_WAGE_THRESHOLD = 4000; // First Schedule: OT & termination benefits for wages ≤ RM4,000
export const MAX_WEEKLY_HOURS = 45; // s.60A(1)
export const MAX_MONTHLY_OT_HOURS = 104; // Employment (Limitation of Overtime Work) Regulations 1980
export const MATERNITY_DAYS = 98; // s.37
export const PATERNITY_DAYS = 7; // s.60FA
export const HOSPITALISATION_DAYS = 60; // s.60F(1)(b)
export const MAX_SUSPENSION_DAYS = 14; // s.14(2)

export function serviceYears(joinDate: Date, asOf: Date = new Date()): number {
  const ms = asOf.getTime() - joinDate.getTime();
  return Math.max(0, ms / (365.25 * 24 * 3600 * 1000));
}

/** s.60E — paid annual leave. */
export function annualLeaveDays(years: number): number {
  if (years < 2) return 8;
  if (years < 5) return 12;
  return 16;
}

/** s.60F — paid sick leave (not requiring hospitalisation). */
export function sickLeaveDays(years: number): number {
  if (years < 2) return 14;
  if (years < 5) return 18;
  return 22;
}

/** s.12 — minimum notice of termination (weeks), absent a longer contractual notice. */
export function noticePeriodWeeks(years: number): number {
  if (years < 2) return 4;
  if (years < 5) return 6;
  return 8;
}

/** Employment (Termination and Lay-Off Benefits) Regulations 1980 — days' wages per year of service. */
export function terminationBenefitDaysPerYear(years: number): number {
  if (years < 2) return 10;
  if (years < 5) return 15;
  return 20;
}

/** Ordinary rate of pay (daily) for monthly-rated employees — s.60I(1C). */
export function ordinaryRateOfPay(monthlySalary: number): number {
  return monthlySalary / 26;
}

export function hourlyRateOfPay(monthlySalary: number, normalHoursPerDay = 8): number {
  return ordinaryRateOfPay(monthlySalary) / normalHoursPerDay;
}

export type DayType = "NORMAL" | "REST_DAY" | "PUBLIC_HOLIDAY";

export const OT_MULTIPLIER: Record<DayType, number> = {
  NORMAL: 1.5, // s.60A(3)(a)
  REST_DAY: 2, // s.60(3)(c) — beyond normal hours on a rest day
  PUBLIC_HOLIDAY: 3, // s.60D(3)(b) — beyond normal hours on a public holiday
};

export interface OtCalcInput {
  monthlySalary: number;
  normalHoursPerDay?: number;
  dayType: DayType;
  /** Hours worked within normal hours on a rest day / public holiday. */
  normalHoursWorked?: number;
  /** Hours worked beyond normal hours. */
  otHours: number;
}

/**
 * Pay for overtime and for work on rest days / public holidays (monthly-rated employee).
 * - Rest day, within normal hours: ≤ half normal hours → ½ ORP; more → 1 ORP (s.60(3)(a)).
 * - Public holiday, within normal hours: 2 × ORP in addition to holiday pay (s.60D(3)(a)).
 */
export function calcOvertimePay(input: OtCalcInput) {
  const hours = input.normalHoursPerDay ?? 8;
  const orp = ordinaryRateOfPay(input.monthlySalary);
  const hrp = orp / hours;
  let dayPay = 0;
  const worked = input.normalHoursWorked ?? 0;
  if (input.dayType === "REST_DAY" && worked > 0) dayPay = worked <= hours / 2 ? orp / 2 : orp;
  if (input.dayType === "PUBLIC_HOLIDAY" && worked > 0) dayPay = orp * 2;
  const otPay = input.otHours * hrp * OT_MULTIPLIER[input.dayType];
  return {
    orp: round2(orp),
    hourlyRate: round2(hrp),
    multiplier: OT_MULTIPLIER[input.dayType],
    dayPay: round2(dayPay),
    otPay: round2(otPay),
    total: round2(dayPay + otPay),
  };
}

export function terminationBenefit(monthlySalary: number, joinDate: Date, lastDay: Date) {
  const years = serviceYears(joinDate, lastDay);
  const daysPerYear = terminationBenefitDaysPerYear(years);
  // Incomplete years are computed pro-rata to the nearest month.
  const months = Math.round(years * 12);
  const amount = (months / 12) * daysPerYear * ordinaryRateOfPay(monthlySalary);
  return {
    years: round2(years),
    daysPerYear,
    eligible: years >= 1,
    amount: years >= 1 ? round2(amount) : 0,
    coveredByEA: monthlySalary <= EA_WAGE_THRESHOLD,
  };
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
