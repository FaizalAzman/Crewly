import { describe, expect, it } from "vitest";
import { maskNric, parseNric } from "@/lib/nric";
import { countCalendarDays, countWorkingDays, dayKind, dayWeight, holidayAppliesToState, rangesOverlap } from "@/lib/calendar";
import { ageOn, initials, parsePeriod, periodOf, rm, round2, shiftPeriod, toCsv, parseDate, numField, boolField } from "@/lib/utils";
import { can, ROLE_PERMISSIONS } from "@/lib/permissions";

const d = (s: string) => parseDate(s)!;
const TODAY = d("2026-09-26");

describe("NRIC parsing", () => {
  it("parses DOB, gender and state", () => {
    const r = parseNric("900101-14-5677", TODAY);
    expect(r.valid).toBe(true);
    expect(r.dateOfBirth?.toISOString().slice(0, 10)).toBe("1990-01-01");
    expect(r.gender).toBe("MALE");
    expect(r.birthState).toBe("KUALA_LUMPUR");
  });
  it("even last digit → female", () => expect(parseNric("950615105432", TODAY).gender).toBe("FEMALE"));
  it("2000s births", () => expect(parseNric("050310-10-1234", TODAY).dateOfBirth?.getUTCFullYear()).toBe(2005));
  it("normalises formatting", () => expect(parseNric("900101145677", TODAY).normalized).toBe("900101-14-5677"));
  it("rejects wrong length", () => expect(parseNric("12345", TODAY).valid).toBe(false));
  it("rejects impossible dates", () => expect(parseNric("901331-14-5677", TODAY).valid).toBe(false));
  it("rejects 30 Feb", () => expect(parseNric("900230-14-5677", TODAY).valid).toBe(false));
  it("foreign-born code (71) is valid but has no state", () => {
    const r = parseNric("880808-71-5001", TODAY);
    expect(r.valid).toBe(true);
    expect(r.bornOverseas).toBe(true);
    expect(r.birthState).toBeNull();
  });
  it("Sabah & Sarawak codes", () => {
    expect(parseNric("850505-12-5555", TODAY).birthState).toBe("SABAH");
    expect(parseNric("850505-13-5555", TODAY).birthState).toBe("SARAWAK");
  });
  it("masks middle digits", () => expect(maskNric("900101-14-5677")).toBe("900101-••-••77"));
});

describe("Holiday state matching", () => {
  it("ALL applies everywhere", () => expect(holidayAppliesToState("ALL", "SABAH")).toBe(true));
  it("ALL with exclusion", () => {
    expect(holidayAppliesToState("ALL,-SARAWAK", "SARAWAK")).toBe(false);
    expect(holidayAppliesToState("ALL,-SARAWAK", "SELANGOR")).toBe(true);
  });
  it("explicit list", () => {
    expect(holidayAppliesToState("KUALA_LUMPUR,LABUAN,PUTRAJAYA", "PUTRAJAYA")).toBe(true);
    expect(holidayAppliesToState("KUALA_LUMPUR,LABUAN,PUTRAJAYA", "SELANGOR")).toBe(false);
  });
});

describe("Working-day calendar", () => {
  const fiveDay = { restDay: 0, offDay: 6, workDaysPerWeek: 5 };
  const fiveHalf = { restDay: 0, offDay: 6, workDaysPerWeek: 5.5 };
  const sixDay = { restDay: 0, offDay: null, workDaysPerWeek: 6 };
  const kedah = { restDay: 5, offDay: 6, workDaysPerWeek: 5 }; // Fri rest, Sat off

  it("Mon–Fri week = 5 days", () => expect(countWorkingDays(d("2026-09-21"), d("2026-09-27"), fiveDay)).toBe(5));
  it("5.5-day week counts Saturday as half", () => expect(countWorkingDays(d("2026-09-21"), d("2026-09-27"), fiveHalf)).toBe(5.5));
  it("6-day week", () => expect(countWorkingDays(d("2026-09-21"), d("2026-09-27"), sixDay)).toBe(6));
  it("Kedah Fri/Sat weekend", () => {
    expect(dayWeight(d("2026-09-25"), kedah)).toBe(0); // Friday
    expect(dayWeight(d("2026-09-27"), kedah)).toBe(1); // Sunday is a working day
  });
  it("skips public holidays", () => {
    const hol = new Set(["2026-09-16"]);
    expect(countWorkingDays(d("2026-09-14"), d("2026-09-18"), fiveDay, hol)).toBe(4);
  });
  it("end before start → 0", () => expect(countWorkingDays(d("2026-09-18"), d("2026-09-14"), fiveDay)).toBe(0));
  it("calendar days inclusive", () => expect(countCalendarDays(d("2026-09-01"), d("2026-09-30"))).toBe(30));
  it("classifies days", () => {
    const hol = new Set(["2026-08-31"]);
    expect(dayKind(d("2026-08-31"), fiveDay, hol)).toBe("HOLIDAY");
    expect(dayKind(d("2026-08-30"), fiveDay, hol)).toBe("REST");
    expect(dayKind(d("2026-08-29"), fiveDay, hol)).toBe("OFF");
    expect(dayKind(d("2026-08-28"), fiveDay, hol)).toBe("WORK");
  });
  it("range overlap is inclusive", () => {
    expect(rangesOverlap(d("2026-01-01"), d("2026-01-05"), d("2026-01-05"), d("2026-01-09"))).toBe(true);
    expect(rangesOverlap(d("2026-01-01"), d("2026-01-04"), d("2026-01-05"), d("2026-01-09"))).toBe(false);
  });
});

describe("Utilities", () => {
  it("formats ringgit", () => {
    expect(rm(1234.5)).toBe("RM1,234.50");
    expect(rm(-10)).toBe("-RM10.00");
    expect(rm(5, { sign: true })).toBe("+RM5.00");
  });
  it("round2 handles float noise", () => expect(round2(1.005)).toBe(1.01));
  it("periods", () => {
    expect(periodOf(d("2026-02-14"))).toBe("2026-02");
    expect(parsePeriod("2026-02")).toMatchObject({ year: 2026, month: 2, daysInMonth: 28 });
    expect(parsePeriod("2028-02").daysInMonth).toBe(29);
    expect(shiftPeriod("2026-01", -1)).toBe("2025-12");
    expect(shiftPeriod("2026-12", 1)).toBe("2027-01");
  });
  it("age on a date", () => {
    expect(ageOn(d("1966-09-27"), TODAY)).toBe(59);
    expect(ageOn(d("1966-09-26"), TODAY)).toBe(60);
  });
  it("initials skip bin/binti/a/l", () => {
    expect(initials("Ahmad bin Ismail")).toBe("AI");
    expect(initials("Nur Aisyah binti Rahman")).toBe("NA");
    expect(initials("Rajesh a/l Subramaniam")).toBe("RS");
  });
  it("CSV escaping", () => expect(toCsv([["a", 'b"c', "d,e"], [1, null, undefined]])).toBe('a,"b""c","d,e"\n1,,'));
  it("form parsing helpers", () => {
    const fd = new FormData();
    fd.set("amount", "1,234.50");
    fd.set("flag", "on");
    expect(numField(fd, "amount")).toBe(1234.5);
    expect(numField(fd, "missing", 7)).toBe(7);
    expect(boolField(fd, "flag")).toBe(true);
    expect(boolField(fd, "missing")).toBe(false);
  });
});

describe("Role permissions", () => {
  it("owner can do everything", () => expect(ROLE_PERMISSIONS.OWNER.length).toBeGreaterThan(25));
  it("HR admin cannot manage billing", () => expect(can("HR_ADMIN", "billing.manage")).toBe(false));
  it("payroll can run payroll but not manage ER cases", () => {
    expect(can("PAYROLL", "payroll.manage")).toBe(true);
    expect(can("PAYROLL", "er.manage")).toBe(false);
  });
  it("manager can approve leave but not see payroll", () => {
    expect(can("MANAGER", "leave.approve")).toBe(true);
    expect(can("MANAGER", "payroll.manage")).toBe(false);
  });
  it("employee has no admin permissions", () => expect(ROLE_PERMISSIONS.EMPLOYEE).toHaveLength(0));
  it("unknown role has nothing", () => expect(can("HACKER", "payroll.manage")).toBe(false));
});
