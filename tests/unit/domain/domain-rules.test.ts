/**
 * Unit tests for the pure (database-free) helpers that live alongside the services.
 * Business-rule tests that need the database live in tests/business.
 */
import { describe, expect, it } from "vitest";
import { available, completedMonths, computeEntitlement } from "@/server/services/leave.service";
import { loanSchedule, compaRatio } from "@/server/services/money.service";
import { distanceMeters, lateMinutes, weeksWithoutRestDay, otSummary } from "@/server/services/time.service";
import { bookValue, passportOkForRenewal, permitAlert } from "@/server/services/relations.service";
import { canMoveStage, finalRating, weightedGoalScore } from "@/server/services/talent.service";
import { enps, mergeTemplate, respondentKey, slaBreached } from "@/server/services/culture.service";
import { tp1Total } from "@/server/services/payroll.service";
import { quote, validateWorkspaceSettings } from "@/server/services/settings.service";
import { checklistProgress } from "@/server/services/lifecycle.service";
import { slugify } from "@/server/services/auth.service";
import { ageBand, concentration, countBy, headcountOn, leaversBetween, tenureBand, turnoverRate } from "@/lib/analytics";

const D = (s: string) => new Date(`${s}T00:00:00Z`);

describe("Leave helpers", () => {
  it("available = entitled + c/f + adj − taken − pending", () => {
    expect(available({ entitled: 12, carriedForward: 3, adjustment: 1, taken: 5, pending: 2 })).toBe(9);
  });
  it.each([
    ["2026-01-01", "2026-12-31", 12],
    ["2026-07-01", "2026-12-31", 6],
    ["2026-07-20", "2026-12-31", 5],
    ["2026-07-10", "2026-12-31", 6],
    ["2026-01-01", "2026-06-30", 6],
    ["2026-01-01", "2026-01-14", 0],
    ["2026-01-01", "2026-01-15", 1],
    ["2026-12-31", "2026-01-01", 0],
  ])("completedMonths(%s → %s) = %s", (a, b, n) => expect(completedMonths(D(a), D(b))).toBe(n));
  it("FIXED and NONE rules", () => {
    expect(computeEntitlement({ entitlementRule: "FIXED", defaultDays: 3, gender: null }, { joinDate: D("2020-01-01"), gender: "MALE" }, 2026)).toBe(3);
    expect(computeEntitlement({ entitlementRule: "NONE", defaultDays: 3, gender: null }, { joinDate: D("2020-01-01"), gender: "MALE" }, 2026)).toBe(0);
  });
});

describe("Loan schedule", () => {
  it("splits principal into instalments with a smaller final one", () => {
    const s = loanSchedule(1000, 300, "2026-11");
    expect(s.map((x) => x.amount)).toEqual([300, 300, 300, 100]);
    expect(s.map((x) => x.period)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(s[s.length - 1].balance).toBe(0);
  });
  it("single instalment for advances", () => expect(loanSchedule(800, 800, "2026-10")).toHaveLength(1));
  it("compa-ratio", () => {
    expect(compaRatio(5500, 5000)).toBe(1.1);
    expect(compaRatio(5000, 0)).toBe(0);
  });
});

describe("Time helpers", () => {
  it("haversine distance", () => {
    expect(distanceMeters(3.1106, 101.6653, 3.1106, 101.6653)).toBe(0);
    const d = distanceMeters(3.139, 101.6869, 3.1579, 101.7123); // KL Sentral → KLCC ≈ 3.5km
    expect(d).toBeGreaterThan(3000);
    expect(d).toBeLessThan(4000);
  });
  it("lateness respects the grace period (MYT)", () => {
    const at = (h: number, m: number) => new Date(Date.UTC(2026, 8, 1, h - 8, m));
    expect(lateMinutes(at(9, 10), "09:00", 10)).toBe(0);
    expect(lateMinutes(at(9, 11), "09:00", 10)).toBe(11);
    expect(lateMinutes(at(8, 30), "09:00", 10)).toBe(0);
  });
  it("detects full weeks without a rest day", () => {
    const week = (restIdx: number | null) => Array.from({ length: 7 }, (_, i) => ({ date: D(`2026-09-${String(7 + i).padStart(2, "0")}`), dayType: i === restIdx ? "REST" : "WORK" }));
    expect(weeksWithoutRestDay(week(6))).toEqual([]);
    expect(weeksWithoutRestDay(week(null))).toEqual(["2026-09-07"]);
    expect(weeksWithoutRestDay(week(null).slice(0, 5))).toEqual([]); // partial week
  });
  it("OT summary ignores rejected", () => {
    expect(otSummary([{ hours: 2, amount: 30, status: "APPROVED" }, { hours: 5, amount: 99, status: "REJECTED" }])).toEqual({ hours: 2, amount: 30 });
  });
});

describe("Compliance helpers", () => {
  const today = D("2026-09-26");
  it.each([
    ["2026-09-25", "EXPIRED"],
    ["2026-10-20", "CRITICAL"],
    ["2026-12-01", "WARNING"],
    ["2027-06-01", "OK"],
  ])("permitAlert(%s) = %s", (d, a) => expect(permitAlert(D(d), today)).toBe(a));
  it("passport needs ≥ 18 months for renewal", () => {
    expect(passportOkForRenewal(D("2028-06-01"), today)).toBe(true);
    expect(passportOkForRenewal(D("2027-06-01"), today)).toBe(false);
    expect(passportOkForRenewal(null, today)).toBe(false);
  });
  it("straight-line book value, floored at zero", () => {
    expect(bookValue(3000, D("2025-09-26"), 3, today)).toBeCloseTo(2000, -1);
    expect(bookValue(3000, D("2020-01-01"), 3, today)).toBe(0);
    expect(bookValue(3000, null, 3, today)).toBe(3000);
  });
});

describe("Talent helpers", () => {
  it.each([
    ["APPLIED", "SCREENING", true],
    ["APPLIED", "OFFER", true],
    ["SCREENING", "APPLIED", true],
    ["OFFER", "HIRED", true],
    ["INTERVIEW", "HIRED", false],
    ["HIRED", "REJECTED", false],
    ["REJECTED", "SCREENING", true],
    ["REJECTED", "OFFER", false],
    ["OFFER", "OFFER", false],
  ] as const)("canMoveStage %s → %s = %s", (a, b, ok) => expect(canMoveStage(a, b)).toBe(ok));
  it("weighted goal score", () => {
    expect(weightedGoalScore([{ weight: 60, progress: 100 }, { weight: 40, progress: 50 }])).toBe(80);
    expect(weightedGoalScore([{ weight: 50, progress: 150 }])).toBe(100); // capped
    expect(weightedGoalScore([])).toBe(0);
  });
  it("final rating blends manager 70% / goals 30%, rounded to 0.5", () => {
    expect(finalRating(4, 100)).toBe(4.5); // 2.8 + 1.5 = 4.3 → 4.5
    expect(finalRating(3, 50)).toBe(3); // 2.1 + 0.9 = 3.0
    expect(finalRating(5, 100)).toBe(5);
    expect(finalRating(1, 0)).toBe(1);
  });
});

describe("Culture helpers", () => {
  it("merges nested fields, formats salary and dates, flags missing", () => {
    const out = mergeTemplate("{{employee.fullName}} earns {{employee.basicSalary}} from {{employee.joinDate}} at {{company.name}} {{employee.nope}} {{today}}", {
      employee: { fullName: "Aina", basicSalary: 4500, joinDate: D("2024-03-01") },
      company: { name: "Acme" },
      extra: { today: "1 Oct 2026" },
    });
    expect(out).toContain("Aina earns RM4,500.00");
    expect(out).toContain("Acme");
    expect(out).toContain("[missing: employee.nope]");
    expect(out).toContain("1 Oct 2026");
  });
  it("eNPS", () => {
    expect(enps([10, 9, 8, 7, 6, 0])).toBe(0);
    expect(enps([10, 10, 9])).toBe(100);
    expect(enps([1, 2])).toBe(-100);
    expect(enps([])).toBeNull();
  });
  it("respondent key is stable and per-survey", () => {
    expect(respondentKey("s1", "e1")).toBe(respondentKey("s1", "e1"));
    expect(respondentKey("s1", "e1")).not.toBe(respondentKey("s2", "e1"));
    expect(respondentKey("s1", "e1")).not.toContain("e1");
  });
  it("SLA breach by priority; resolved tickets never breach", () => {
    const created = new Date("2026-09-01T00:00:00Z");
    expect(slaBreached(created, "URGENT", "OPEN", new Date("2026-09-01T05:00:00Z"))).toBe(true);
    expect(slaBreached(created, "LOW", "OPEN", new Date("2026-09-03T00:00:00Z"))).toBe(false);
    expect(slaBreached(created, "URGENT", "RESOLVED", new Date("2026-09-10T00:00:00Z"))).toBe(false);
  });
});

describe("Payroll & platform helpers", () => {
  it("TP1 total applies per-category caps", () => {
    expect(tp1Total({ lifestyle: 5000, medicalSelf: 500, prs: 3000 })).toBe(2500 + 500 + 3000);
    expect(tp1Total(null)).toBe(0);
  });
  it("quote: min 10 seats, 8% SST, yearly = 10 months", () => {
    expect(quote("GROWTH", 5, "MONTHLY")).toMatchObject({ billable: 10, subtotal: 120, sst: 9.6, total: 129.6 });
    expect(quote("ENTERPRISE", 50, "YEARLY")).toMatchObject({ subtotal: 9000, total: 9720 });
  });
  it("workspace validation accepts sane settings", () => {
    expect(() => validateWorkspaceSettings({ name: "X", workDaysPerWeek: 5, restDay: 0, offDay: 6, payrollCutoff: 25, payDay: 28, unpaidLeaveBasis: "WORKING_DAYS", mileageRate: 0.6, lateGraceMinutes: 10 })).not.toThrow();
    expect(() => validateWorkspaceSettings({ name: "X", workDaysPerWeek: 6, restDay: 0, offDay: null, payrollCutoff: 25, payDay: 31, unpaidLeaveBasis: "FIXED_26", mileageRate: 0.6, lateGraceMinutes: 0 })).not.toThrow();
  });
  it("checklist progress", () => {
    expect(checklistProgress([{ done: true }, { done: false }, { done: false }, { done: true }])).toBe(50);
    expect(checklistProgress([])).toBe(0);
  });
  it("slugify strips company suffixes", () => {
    expect(slugify("Nasi Lemak Labs Sdn. Bhd.")).toBe("nasi-lemak-labs");
    expect(slugify("Petronas Berhad")).toBe("petronas");
    expect(slugify("!!!")).toBe("workspace");
  });
});

describe("Analytics", () => {
  const p = (join: string, lwd: string | null, status = "ACTIVE", extra: Record<string, unknown> = {}) => ({ joinDate: D(join), lastWorkingDate: lwd ? D(lwd) : null, status, dateOfBirth: D("1990-01-01"), gender: "MALE", race: "MALAY", citizenship: "CITIZEN", ...extra });
  const people = [p("2020-01-01", null), p("2026-03-01", null), p("2019-01-01", "2026-05-31", "RESIGNED"), p("2021-01-01", "2026-10-31", "NOTICE")];
  it("headcount on a date", () => {
    expect(headcountOn(people, D("2026-01-31"))).toBe(3);
    expect(headcountOn(people, D("2026-06-30"))).toBe(3);
  });
  it("leavers between dates only counts people who have left", () => {
    expect(leaversBetween(people, D("2026-01-01"), D("2026-12-31"))).toBe(1);
  });
  it("annualised turnover", () => {
    expect(turnoverRate(2, 20, 20, 12)).toBe(10);
    expect(turnoverRate(1, 20, 20, 6)).toBe(10);
    expect(turnoverRate(1, 0, 0)).toBe(0);
  });
  it("bands & grouping", () => {
    expect([24, 25, 44, 55].map(ageBand)).toEqual(["< 25", "25–34", "35–44", "55+"]);
    expect([0.5, 1.5, 3, 7, 12].map(tenureBand)).toEqual(["< 1 yr", "1–2 yrs", "2–5 yrs", "5–10 yrs", "10+ yrs"]);
    expect(countBy(["a", "b", "a"], (x) => x)).toEqual({ a: 2, b: 1 });
    expect(concentration({ a: 3, b: 1 })).toBe(75);
    expect(concentration({})).toBe(0);
  });
});
