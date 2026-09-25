/** Pure HR analytics helpers (unit-tested). */

export interface PersonLite {
  joinDate: Date;
  lastWorkingDate: Date | null;
  status: string;
  dateOfBirth: Date | null;
  gender: string;
  race: string;
  citizenship: string;
}

const LEFT = ["RESIGNED", "TERMINATED", "RETIRED"];

/** Headcount at the end of a given date (employed on that date). */
export function headcountOn(people: PersonLite[], date: Date) {
  return people.filter((p) => p.joinDate <= date && (!p.lastWorkingDate || p.lastWorkingDate >= date || !LEFT.includes(p.status))).length;
}

/** Leavers whose last working day falls in [from, to] and who have actually left. */
export function leaversBetween(people: PersonLite[], from: Date, to: Date) {
  return people.filter((p) => LEFT.includes(p.status) && p.lastWorkingDate && p.lastWorkingDate >= from && p.lastWorkingDate <= to).length;
}

/** Annualised turnover % = leavers ÷ average headcount × (12 ÷ months). */
export function turnoverRate(leavers: number, startHeadcount: number, endHeadcount: number, months = 12) {
  const avg = (startHeadcount + endHeadcount) / 2;
  if (!avg) return 0;
  return Math.round((leavers / avg) * (12 / months) * 1000) / 10;
}

export function countBy<T>(items: T[], key: (t: T) => string) {
  const out: Record<string, number> = {};
  for (const i of items) out[key(i)] = (out[key(i)] ?? 0) + 1;
  return out;
}

export function ageBand(age: number) {
  if (age < 25) return "< 25";
  if (age < 35) return "25–34";
  if (age < 45) return "35–44";
  if (age < 55) return "45–54";
  return "55+";
}

export function tenureBand(years: number) {
  if (years < 1) return "< 1 yr";
  if (years < 2) return "1–2 yrs";
  if (years < 5) return "2–5 yrs";
  if (years < 10) return "5–10 yrs";
  return "10+ yrs";
}

/** Share (%) of the largest group — a quick diversity concentration indicator. */
export function concentration(counts: Record<string, number>) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return 0;
  return Math.round((Math.max(...Object.values(counts)) / total) * 100);
}
