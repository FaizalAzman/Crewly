import { describe, expect, it } from "vitest";
import {
  annualLeaveDays,
  calcOvertimePay,
  EA_WAGE_THRESHOLD,
  hourlyRateOfPay,
  MATERNITY_DAYS,
  MAX_MONTHLY_OT_HOURS,
  MINIMUM_WAGE,
  noticePeriodWeeks,
  ordinaryRateOfPay,
  PATERNITY_DAYS,
  serviceYears,
  sickLeaveDays,
  terminationBenefit,
  terminationBenefitDaysPerYear,
} from "@/lib/statutory/employment-act";
import { calcHrdf, hrdfRate } from "@/lib/statutory/hrdf";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("Statutory constants (EA 1955 as amended 2022)", () => {
  it("minimum wage RM1,700", () => expect(MINIMUM_WAGE).toBe(1700));
  it("maternity 98 days", () => expect(MATERNITY_DAYS).toBe(98));
  it("paternity 7 days", () => expect(PATERNITY_DAYS).toBe(7));
  it("OT limit 104 hours per month", () => expect(MAX_MONTHLY_OT_HOURS).toBe(104));
  it("First Schedule wage threshold RM4,000", () => expect(EA_WAGE_THRESHOLD).toBe(4000));
});

describe("Service years", () => {
  it("exactly 2 years", () => expect(serviceYears(d("2024-01-01"), d("2026-01-01"))).toBeCloseTo(2, 1));
  it("never negative", () => expect(serviceYears(d("2027-01-01"), d("2026-01-01"))).toBe(0));
});

describe("Annual leave s.60E", () => {
  it.each([
    [0, 8],
    [1.99, 8],
    [2, 12],
    [4.99, 12],
    [5, 16],
    [20, 16],
  ])("%s years → %s days", (y, days) => expect(annualLeaveDays(y)).toBe(days));
});

describe("Sick leave s.60F", () => {
  it.each([
    [0.5, 14],
    [2, 18],
    [4.9, 18],
    [5, 22],
  ])("%s years → %s days", (y, days) => expect(sickLeaveDays(y)).toBe(days));
});

describe("Notice period s.12", () => {
  it.each([
    [1, 4],
    [2, 6],
    [5, 8],
  ])("%s years → %s weeks", (y, w) => expect(noticePeriodWeeks(y)).toBe(w));
});

describe("Termination & lay-off benefits", () => {
  it.each([
    [1, 10],
    [3, 15],
    [7, 20],
  ])("%s years → %s days/year", (y, days) => expect(terminationBenefitDaysPerYear(y)).toBe(days));

  it("RM3,000 salary, 3 years → 15 × 3 × ORP", () => {
    const r = terminationBenefit(3000, d("2023-01-01"), d("2026-01-01"));
    expect(r.daysPerYear).toBe(15);
    expect(r.amount).toBeCloseTo(3 * 15 * (3000 / 26), 0);
    expect(r.coveredByEA).toBe(true);
  });
  it("not eligible below 12 months of service", () => {
    const r = terminationBenefit(3000, d("2025-06-01"), d("2026-01-01"));
    expect(r.eligible).toBe(false);
    expect(r.amount).toBe(0);
  });
  it("incomplete years are pro-rated by month", () => {
    const r = terminationBenefit(2600, d("2024-01-01"), d("2025-07-01"));
    expect(r.amount).toBeCloseTo((18 / 12) * 10 * 100, 0);
  });
  it("flags employees above the RM4,000 First Schedule threshold", () => {
    expect(terminationBenefit(8000, d("2020-01-01"), d("2026-01-01")).coveredByEA).toBe(false);
  });
});

describe("Rate of pay", () => {
  it("ORP = monthly ÷ 26", () => expect(ordinaryRateOfPay(2600)).toBe(100));
  it("hourly = ORP ÷ normal hours", () => expect(hourlyRateOfPay(2600, 8)).toBe(12.5));
});

describe("Overtime pay", () => {
  const salary = 2600; // ORP 100, HRP 12.50
  it("normal day OT at 1.5×", () => {
    expect(calcOvertimePay({ monthlySalary: salary, dayType: "NORMAL", otHours: 2 })).toMatchObject({ otPay: 37.5, total: 37.5, multiplier: 1.5 });
  });
  it("rest day: > half normal hours = 1 day's pay, plus OT at 2×", () => {
    const r = calcOvertimePay({ monthlySalary: salary, dayType: "REST_DAY", normalHoursWorked: 8, otHours: 3 });
    expect(r.dayPay).toBe(100);
    expect(r.otPay).toBe(75);
    expect(r.total).toBe(175);
  });
  it("rest day: ≤ half normal hours = half day's pay", () => {
    expect(calcOvertimePay({ monthlySalary: salary, dayType: "REST_DAY", normalHoursWorked: 4, otHours: 0 }).dayPay).toBe(50);
  });
  it("public holiday: 2 days' pay plus OT at 3×", () => {
    const r = calcOvertimePay({ monthlySalary: salary, dayType: "PUBLIC_HOLIDAY", normalHoursWorked: 8, otHours: 2 });
    expect(r.dayPay).toBe(200);
    expect(r.otPay).toBe(75);
    expect(r.total).toBe(275);
  });
  it("respects non-standard normal hours", () => {
    expect(calcOvertimePay({ monthlySalary: salary, dayType: "NORMAL", otHours: 1, normalHoursPerDay: 10 }).hourlyRate).toBe(10);
  });
});

describe("HRD Corp levy", () => {
  it("1% for 10+ Malaysian employees", () => expect(hrdfRate(10)).toBe(0.01));
  it("0.5% for 5–9 only if opted in", () => {
    expect(hrdfRate(7, true)).toBe(0.005);
    expect(hrdfRate(7, false)).toBe(0);
  });
  it("nil below 5", () => expect(hrdfRate(4, true)).toBe(0));
  it("computes to the sen", () => expect(calcHrdf(3456.78, 0.01)).toBe(34.57));
});
