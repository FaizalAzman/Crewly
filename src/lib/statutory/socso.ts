/**
 * SOCSO (PERKESO) — Employees' Social Security Act 1969, and
 * EIS (SIP) — Employment Insurance System Act 2017.
 *
 * Wage ceiling RM6,000 (effective 1 Oct 2024).
 *
 * SOCSO categories:
 *  - Category 1 (Employment Injury + Invalidity), employees below 60: ER 1.75%, EE 0.5%
 *  - Category 2 (Employment Injury only), employees 60+ : ER 1.25%, EE 0%
 *  - Foreign workers (since 2020): Employment Injury only, ER 1.25%
 *
 * EIS: EE 0.2%, ER 0.2%, Malaysian citizens & PRs aged 18 – 59.
 *
 * Contributions are table based. From RM300.01 upward the bands are RM100 wide and the
 * published figure equals the rate applied to the band mid-point, rounded to 5 sen
 * (half-way values go to the figure ending in 5, as in the official schedule).
 */
import type { Citizenship } from "./epf";

export const SOCSO_CEILING = 6000;

type Band = { max: number; mid: number };

// Low bands have irregular widths in the schedule.
const LOW_BANDS: { max: number; cat1Er: number; cat1Ee: number; cat2Er: number; eis: number }[] = [
  { max: 30, cat1Er: 0.4, cat1Ee: 0.1, cat2Er: 0.3, eis: 0.05 },
  { max: 50, cat1Er: 0.7, cat1Ee: 0.2, cat2Er: 0.5, eis: 0.1 },
  { max: 70, cat1Er: 1.1, cat1Ee: 0.3, cat2Er: 0.8, eis: 0.15 },
  { max: 100, cat1Er: 1.5, cat1Ee: 0.4, cat2Er: 1.1, eis: 0.2 },
  { max: 140, cat1Er: 2.1, cat1Ee: 0.6, cat2Er: 1.5, eis: 0.25 },
  { max: 200, cat1Er: 2.95, cat1Ee: 0.85, cat2Er: 2.1, eis: 0.35 },
  { max: 300, cat1Er: 4.35, cat1Ee: 1.25, cat2Er: 3.1, eis: 0.5 },
];

function band(wages: number): Band {
  const w = Math.min(wages, SOCSO_CEILING + 0.01); // anything above ceiling uses the top band
  const capped = w > SOCSO_CEILING ? SOCSO_CEILING : w;
  const max = Math.ceil(capped / 100) * 100;
  return { max, mid: max - 50 };
}

/** Round a value (in RM) to 5 sen; exact half-way cases go to the value ending in 5 sen. */
function roundTo5Sen(value: number): number {
  const cents = Math.round(value * 1000) / 10; // e.g. 787.5
  const rem = cents % 5;
  if (Math.abs(rem - 2.5) < 1e-6) return (Math.floor(cents / 10) * 10 + 5) / 100;
  return Math.round(cents / 5) * 5 / 100;
}

export type SocsoCategory = 1 | 2;

export interface SocsoInput {
  wages: number;
  age: number;
  citizenship: Citizenship;
}

export interface SocsoResult {
  category: SocsoCategory | "FOREIGN";
  employee: number;
  employer: number;
  note: string;
}

export function socsoCategory(age: number, citizenship: Citizenship): SocsoCategory | "FOREIGN" {
  if (citizenship === "FOREIGNER") return "FOREIGN";
  return age >= 60 ? 2 : 1;
}

export function calcSocso({ wages, age, citizenship }: SocsoInput): SocsoResult {
  const category = socsoCategory(age, citizenship);
  if (wages <= 0) return { category, employee: 0, employer: 0, note: "No wages" };
  const low = LOW_BANDS.find((b) => wages <= b.max);
  if (low) {
    if (category === 1) return { category, employee: low.cat1Ee, employer: low.cat1Er, note: "Category 1 (EI + Invalidity)" };
    return { category, employee: 0, employer: low.cat2Er, note: category === 2 ? "Category 2 (EI only, 60+)" : "Foreign worker (EI only)" };
  }
  const { mid } = band(wages);
  if (category === 1) {
    return {
      category,
      employer: roundTo5Sen(mid * 0.0175),
      employee: roundTo5Sen(mid * 0.005),
      note: wages > SOCSO_CEILING ? "Category 1, capped at RM6,000 ceiling" : "Category 1 (EI + Invalidity)",
    };
  }
  return {
    category,
    employer: roundTo5Sen(mid * 0.0125),
    employee: 0,
    note: category === 2 ? "Category 2 (EI only, 60+)" : "Foreign worker (EI only)",
  };
}

export interface EisResult {
  eligible: boolean;
  employee: number;
  employer: number;
  note: string;
}

export function calcEis({ wages, age, citizenship }: SocsoInput): EisResult {
  if (citizenship === "FOREIGNER") return { eligible: false, employee: 0, employer: 0, note: "Foreign workers are not covered by EIS" };
  if (age < 18 || age >= 60) return { eligible: false, employee: 0, employer: 0, note: "EIS covers ages 18 – 59 only" };
  if (wages <= 0) return { eligible: true, employee: 0, employer: 0, note: "No wages" };
  const low = LOW_BANDS.find((b) => wages <= b.max);
  const amount = low ? low.eis : roundTo5Sen(band(wages).mid * 0.002);
  return { eligible: true, employee: amount, employer: amount, note: wages > SOCSO_CEILING ? "Capped at RM6,000 ceiling" : "0.2% / 0.2%" };
}
