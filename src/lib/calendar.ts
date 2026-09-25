import { toISODate } from "./utils";

/** "ALL", "ALL,-SARAWAK" (all except), or "SELANGOR,KUALA_LUMPUR". */
export function holidayAppliesToState(states: string, state: string): boolean {
  const parts = states.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.includes("ALL")) return !parts.includes(`-${state}`);
  return parts.includes(state);
}

export interface WorkWeek {
  /** 0 = Sunday … 6 = Saturday */
  restDay: number;
  /** Off day (not a rest day) — e.g. Saturday for a 5-day week. null for 6-day week. */
  offDay: number | null;
  /** 5, 5.5 or 6. With 5.5, the off day counts as a half working day. */
  workDaysPerWeek: number;
}

export const DEFAULT_WORK_WEEK: WorkWeek = { restDay: 0, offDay: 6, workDaysPerWeek: 5 };

/** Working-day weight of a date (1, 0.5 or 0), ignoring holidays. */
export function dayWeight(date: Date, ww: WorkWeek): number {
  const dow = date.getUTCDay();
  if (dow === ww.restDay) return 0;
  if (ww.offDay !== null && dow === ww.offDay) return ww.workDaysPerWeek === 5.5 ? 0.5 : ww.workDaysPerWeek >= 6 ? 1 : 0;
  return 1;
}

export type DayKind = "WORK" | "REST" | "OFF" | "HOLIDAY";

export function dayKind(date: Date, ww: WorkWeek, holidays: Set<string>): DayKind {
  if (holidays.has(toISODate(date))) return "HOLIDAY";
  const dow = date.getUTCDay();
  if (dow === ww.restDay) return "REST";
  if (ww.offDay !== null && dow === ww.offDay && ww.workDaysPerWeek < 6) return ww.workDaysPerWeek === 5.5 ? "WORK" : "OFF";
  return "WORK";
}

/**
 * Number of working days between start and end (inclusive), skipping rest days, off days and
 * public holidays (ISO date strings).
 */
export function countWorkingDays(start: Date, end: Date, ww: WorkWeek, holidays: Set<string> = new Set()): number {
  if (end < start) return 0;
  let total = 0;
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const d = new Date(t);
    if (holidays.has(toISODate(d))) continue;
    total += dayWeight(d, ww);
  }
  return total;
}

export function countCalendarDays(start: Date, end: Date) {
  if (end < start) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

export function eachDay(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) out.push(new Date(t));
  return out;
}

/** Whether a date range overlaps another (inclusive). */
export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart <= bEnd && bStart <= aEnd;
}
