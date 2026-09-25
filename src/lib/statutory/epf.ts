/**
 * EPF (KWSP) — Third Schedule, EPF Act 1991.
 *
 * Rates (monthly wages):
 *  - Citizen / PR below 60   : EE 11%, ER 13% (wages <= RM5,000) or 12% (> RM5,000)
 *  - Citizen aged 60+        : EE 0%,  ER 4%
 *  - PR aged 60+             : EE 5.5%, ER 6.5%
 *  - Non-citizen (from Oct 2025 wages): EE 2%, ER 2%
 *
 * Band rounding (Third Schedule):
 *  - wages <= RM10            : nil
 *  - RM10.01 – RM5,000        : RM20 bands, % applied to the band's upper limit, rounded UP to next ringgit
 *  - RM5,000.01 – RM20,000    : RM100 bands, same rule
 *  - above RM20,000           : exact %, rounded UP to next ringgit
 */

export type Citizenship = "CITIZEN" | "PR" | "FOREIGNER";

export interface EpfInput {
  wages: number;
  age: number;
  citizenship: Citizenship;
  /** Optional voluntary higher employee rate, in percent (e.g. 11 or 13). */
  employeeRateOverride?: number | null;
  /** Optional higher employer rate, in percent. */
  employerRateOverride?: number | null;
}

export interface EpfResult {
  employee: number;
  employer: number;
  employeeRate: number;
  employerRate: number;
  bandWage: number;
  note: string;
}

export function epfRates(wages: number, age: number, citizenship: Citizenship) {
  if (citizenship === "FOREIGNER") return { ee: 2, er: 2, note: "Non-citizen (2% / 2% from Oct 2025)" };
  if (age >= 60) {
    if (citizenship === "PR") return { ee: 5.5, er: 6.5, note: "PR aged 60 and above" };
    return { ee: 0, er: 4, note: "Citizen aged 60 and above" };
  }
  return { ee: 11, er: wages <= 5000 ? 13 : 12, note: wages <= 5000 ? "Below 60, wages ≤ RM5,000" : "Below 60, wages > RM5,000" };
}

/** Upper limit of the Third Schedule band the wage falls into (in ringgit). */
export function epfBandWage(wages: number): number {
  if (wages <= 10) return 0;
  if (wages <= 20) return 20;
  if (wages <= 5000) return Math.ceil(wages / 20) * 20;
  if (wages <= 20000) return Math.ceil(wages / 100) * 100;
  return wages;
}

/** percent * amount, rounded up to next ringgit, using integer maths to avoid float drift. */
function pctCeil(amount: number, percent: number): number {
  const cents = Math.round(amount * 100);
  const bps = Math.round(percent * 100); // 11% -> 1100
  const numerator = cents * bps; // cents * bps / 10000 = cents of contribution
  const contribCents = numerator / 10000;
  return Math.ceil(Math.round(contribCents * 1000) / 1000 / 100);
}

export function calcEpf(input: EpfInput): EpfResult {
  const wages = Math.max(0, input.wages);
  const base = epfRates(wages, input.age, input.citizenship);
  const ee = input.employeeRateOverride ?? base.ee;
  const er = input.employerRateOverride ?? base.er;
  const band = epfBandWage(wages);
  if (band === 0) return { employee: 0, employer: 0, employeeRate: ee, employerRate: er, bandWage: 0, note: "Wages ≤ RM10: nil" };
  return {
    employee: pctCeil(band, ee),
    employer: pctCeil(band, er),
    employeeRate: ee,
    employerRate: er,
    bandWage: band,
    note: base.note,
  };
}
