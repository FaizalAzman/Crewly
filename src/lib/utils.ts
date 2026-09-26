import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function rm(n: number | null | undefined, opts: { decimals?: number; sign?: boolean } = {}) {
  const v = n ?? 0;
  const d = opts.decimals ?? 2;
  const s = Math.abs(v).toLocaleString("en-MY", { minimumFractionDigits: d, maximumFractionDigits: d });
  const sign = v < 0 ? "-" : opts.sign && v > 0 ? "+" : "";
  return `${sign}RM${s}`;
}

export function num(n: number | null | undefined, decimals = 0) {
  return (n ?? 0).toLocaleString("en-MY", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function fmtDate(d: Date | string | null | undefined, style: "short" | "long" | "iso" = "short") {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "-";
  if (style === "iso") return toISODate(date);
  return date.toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: style === "long" ? "numeric" : "2-digit",
    timeZone: "Asia/Kuala_Lumpur",
  });
}

export function fmtTime(d: Date | string | null | undefined) {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kuala_Lumpur" });
}

/** YYYY-MM-DD in UTC (all calendar dates are stored as UTC midnight). */
export function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Parse "YYYY-MM-DD" to a UTC-midnight Date. */
export function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

export function utcDate(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m, d));
}

/** Today as UTC-midnight in Malaysia time (UTC+8). */
export function todayMY(now = new Date()) {
  const my = new Date(now.getTime() + 8 * 3600 * 1000);
  return new Date(Date.UTC(my.getUTCFullYear(), my.getUTCMonth(), my.getUTCDate()));
}

export function addDays(d: Date, n: number) {
  return new Date(d.getTime() + n * 86400000);
}

export function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function periodOf(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function parsePeriod(period: string) {
  const [y, m] = period.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  return { year: y, month: m, start, end, daysInMonth: end.getUTCDate() };
}

export function periodLabel(period: string) {
  const { start } = parsePeriod(period);
  return start.toLocaleDateString("en-MY", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function shiftPeriod(period: string, delta: number) {
  const { year, month } = parsePeriod(period);
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return periodOf(d);
}

export function ageOn(dob: Date | null | undefined, on: Date) {
  if (!dob) return 30;
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const m = on.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

export function initials(name: string) {
  return name
    .replace(/\b(bin|binti|a\/l|a\/p|bt|b\.)\b/gi, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function str(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function optStr(fd: FormData, key: string) {
  const v = str(fd, key);
  return v === "" ? null : v;
}

export function numField(fd: FormData, key: string, fallback = 0) {
  const v = str(fd, key);
  if (v === "") return fallback;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

export function boolField(fd: FormData, key: string) {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

export function dateField(fd: FormData, key: string) {
  return parseDate(str(fd, key));
}

export function toCsv(rows: (string | number | null | undefined)[][]) {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const s = c === null || c === undefined ? "" : String(c);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
}

export const pick = <T,>(arr: readonly T[], i: number) => arr[((i % arr.length) + arr.length) % arr.length];

/** RFC-4180-ish CSV parser: quoted fields, escaped quotes, commas/newlines inside quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
