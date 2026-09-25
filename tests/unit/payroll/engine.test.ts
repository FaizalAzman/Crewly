import { describe, expect, it } from "vitest";
import { computePayslip, type EngineInput, type EngineLine } from "@/lib/payroll/engine";

const D = (s: string) => new Date(`${s}T00:00:00Z`);
const WW = { restDay: 0, offDay: 6, workDaysPerWeek: 5 };

function input(overrides: Partial<EngineInput> = {}, emp: Partial<EngineInput["employee"]> = {}): EngineInput {
  return {
    period: "2026-01",
    workWeek: WW,
    holidays: new Set(),
    unpaidLeaveBasis: "WORKING_DAYS",
    recurring: [],
    adjustments: [],
    unpaidLeaveDays: 0,
    overtimeAmount: 0,
    claims: [],
    loans: [],
    ytd: { Y: 0, K: 0, X: 0, Z: 0, LP: 0, socsoEisRelief: 0 },
    tp1Total: 0,
    hrdfRate: 0.01,
    ...overrides,
    employee: {
      id: "e1",
      basicSalary: 5000,
      joinDate: D("2020-01-01"),
      lastWorkingDate: null,
      dateOfBirth: D("1990-01-01"),
      citizenship: "CITIZEN",
      maritalStatus: "SINGLE",
      spouseWorking: false,
      spouseDisabled: false,
      disabled: false,
      taxResident: true,
      zakatMonthly: 0,
      epfEmployeeRate: null,
      epfEmployerRate: null,
      hrdfApplicable: true,
      employmentType: "PERMANENT",
      children: [],
      ...emp,
    },
  };
}

const allowance = (code: string, amount: number, f: Partial<EngineLine> = {}): EngineLine => ({ code, name: code, kind: "EARNING", epf: true, socso: true, eis: true, pcb: true, hrdf: true, additional: false, amount, ...f });

describe("computePayslip — basics", () => {
  it("full month, no extras", () => {
    const r = computePayslip(input());
    expect(r).toMatchObject({ proratedBasic: 5000, grossPay: 5000, epfEE: 550, epfER: 650, socsoEE: 24.75, eisEE: 9.9, hrdf: 50 });
    expect(r.workingDays).toBe(22); // Jan 2026 weekdays
    expect(r.netPay).toBeCloseTo(5000 - 550 - 24.75 - 9.9 - r.pcb, 2);
    expect(r.employerCost).toBeCloseTo(5000 + 650 + r.socsoER + r.eisER + 50, 2);
  });

  it("net pay equals gross minus all deduction lines", () => {
    const r = computePayslip(input({ recurring: [allowance("ALW", 300), { ...allowance("DED", 50), kind: "DEDUCTION" }] }));
    const ded = r.lines.filter((l) => l.kind === "DEDUCTION").reduce((s, l) => s + l.amount, 0);
    expect(r.netPay).toBeCloseTo(r.grossPay - ded, 2);
  });

  it("not employed in period → employed=false and zero pay", () => {
    const r = computePayslip(input({}, { joinDate: D("2026-02-01") }));
    expect(r.employed).toBe(false);
    expect(r.grossPay).toBe(0);
    expect(r.pcb).toBe(0);
  });

  it("holidays reduce the working-day count", () => {
    const r = computePayslip(input({ holidays: new Set(["2026-01-01"]) }));
    expect(r.workingDays).toBe(21);
  });
});

describe("computePayslip — proration", () => {
  it("joiner pro-rated by working days", () => {
    const r = computePayslip(input({}, { joinDate: D("2026-01-19") })); // 10 of 22 working days
    expect(r.daysPaid).toBe(10);
    expect(r.proratedBasic).toBeCloseTo((5000 * 10) / 22, 2);
  });

  it("leaver pro-rated", () => {
    const r = computePayslip(input({}, { lastWorkingDate: D("2026-01-09") })); // 7 working days
    expect(r.proratedBasic).toBeCloseTo((5000 * 7) / 22, 2);
  });

  it("calendar-days basis", () => {
    const r = computePayslip(input({ unpaidLeaveBasis: "CALENDAR_DAYS" }, { joinDate: D("2026-01-17") })); // 15 of 31 days
    expect(r.proratedBasic).toBeCloseTo((5000 * 15) / 31, 2);
  });

  it("fixed-26 basis", () => {
    const r = computePayslip(input({ unpaidLeaveBasis: "FIXED_26" }, { joinDate: D("2026-01-19") }));
    expect(r.proratedBasic).toBeCloseTo((5000 * 10) / 26, 2);
  });

  it("fixed allowances are pro-rated with basic unless prorate=false", () => {
    const r = computePayslip(input({ recurring: [allowance("ALW_TRANS", 440), allowance("ALW_PHONE", 100, { prorate: false })] }, { joinDate: D("2026-01-19") }));
    expect(r.lines.find((l) => l.code === "ALW_TRANS")?.amount).toBeCloseTo(200, 2);
    expect(r.lines.find((l) => l.code === "ALW_PHONE")?.amount).toBe(100);
  });
});

describe("computePayslip — unpaid leave", () => {
  it("deducts per working day and reduces statutory wages", () => {
    const r = computePayslip(input({ unpaidLeaveDays: 2 }));
    expect(r.unpaidLeaveDeduction).toBeCloseTo((5000 / 22) * 2, 2);
    expect(r.epfWages).toBeCloseTo(5000 - r.unpaidLeaveDeduction, 2);
    expect(r.lines.find((l) => l.code === "UNPAID")?.amount).toBeLessThan(0);
  });

  it("never deducts more than the prorated basic", () => {
    const r = computePayslip(input({ unpaidLeaveDays: 40 }));
    expect(r.unpaidLeaveDeduction).toBe(5000);
    expect(r.grossPay).toBe(0);
  });
});

describe("computePayslip — statutory wage bases", () => {
  it("OT is excluded from EPF but included in SOCSO/EIS", () => {
    const r = computePayslip(input({ overtimeAmount: 300 }));
    expect(r.epfWages).toBe(5000);
    expect(r.socsoWages).toBe(5300);
  });

  it("bonus is EPF-able, not SOCSO-able, and taxed as additional remuneration", () => {
    const bonus = allowance("BONUS", 5000, { socso: false, eis: false, hrdf: false, additional: true });
    const r = computePayslip(input({ adjustments: [bonus] }));
    expect(r.epfWages).toBe(10000);
    expect(r.socsoWages).toBe(5000);
    expect(r.pcbYt).toBe(5000);
    expect(r.pcbAdditional).toBeGreaterThan(0);
    expect(r.epfEE).toBe(1100); // 11% of 10,000 (RM100 band)
  });

  it("non-taxable claims don't touch EPF or PCB; taxable claims hit PCB only", () => {
    const r = computePayslip(input({ claims: [{ amount: 120, taxable: false }, { amount: 80, taxable: true }] }));
    expect(r.grossPay).toBe(5200);
    expect(r.epfWages).toBe(5000);
    expect(r.pcbY1).toBe(5080);
  });

  it("HRDF only for citizens with hrdfApplicable", () => {
    expect(computePayslip(input({}, { citizenship: "PR" })).hrdf).toBe(0);
    expect(computePayslip(input({}, { hrdfApplicable: false })).hrdf).toBe(0);
    expect(computePayslip(input({ hrdfRate: 0 })).hrdf).toBe(0);
  });

  it("age is taken at the start of the period (60 on the 1st → 60+ rates)", () => {
    const r = computePayslip(input({}, { dateOfBirth: D("1966-01-01") }));
    expect(r.epfEE).toBe(0);
    expect(r.eisEE).toBe(0);
  });

  it("voluntary EPF rate overrides are honoured", () => {
    expect(computePayslip(input({}, { epfEmployeeRate: 13 })).epfEE).toBe(650);
  });
});

describe("computePayslip — PCB inputs", () => {
  it("zakat offsets PCB and appears as its own line", () => {
    const a = computePayslip(input({}, { basicSalary: 9000 }));
    const b = computePayslip(input({}, { basicSalary: 9000, zakatMonthly: 50 }));
    expect(b.zakat).toBe(50);
    expect(a.pcb - b.pcb).toBeCloseTo(50, 1);
    expect(b.lines.some((l) => l.code === "ZAKAT")).toBe(true);
  });

  it("SOCSO + EIS relief is capped at RM350 per year", () => {
    const r = computePayslip(input({ ytd: { Y: 0, K: 0, X: 0, Z: 0, LP: 340, socsoEisRelief: 340 } }));
    expect(r.socsoEisReliefUsed).toBe(10);
  });

  it("TP1 reliefs are claimed once, not every month", () => {
    const first = computePayslip(input({ tp1Total: 3000 }));
    expect(first.lpUsed).toBeCloseTo(3000 + first.socsoEisReliefUsed, 2);
    const later = computePayslip(input({ period: "2026-02", tp1Total: 3000, ytd: { Y: 5000, K: 550, X: first.pcb, Z: 0, LP: first.lpUsed, socsoEisRelief: first.socsoEisReliefUsed } }));
    expect(later.lpUsed).toBeCloseTo(later.socsoEisReliefUsed, 2);
  });

  it("child relief and category 2 lower PCB", () => {
    const single = computePayslip(input({}, { basicSalary: 10000 })).pcb;
    const married = computePayslip(input({}, { basicSalary: 10000, maritalStatus: "MARRIED", spouseWorking: false, children: [{ dateOfBirth: D("2015-01-01"), studying: false, disabled: false }] })).pcb;
    expect(married).toBeLessThan(single);
  });

  it("non-residents pay 30%", () => {
    expect(computePayslip(input({}, { taxResident: false })).pcb).toBe(1500);
  });
});

describe("computePayslip — loans & warnings", () => {
  it("deducts instalments but never more than the balance", () => {
    const r = computePayslip(input({ loans: [{ loanId: "L1", amount: 500, balance: 200 }] }));
    expect(r.lines.find((l) => l.code === "LOAN:L1")?.amount).toBe(200);
  });

  it("never lets loans push net pay below zero", () => {
    const r = computePayslip(input({ loans: [{ loanId: "L1", amount: 99999, balance: 99999 }] }));
    expect(r.netPay).toBeCloseTo(0, 2);
  });

  it("warns when non-statutory deductions exceed 50% of wages (EA s.24)", () => {
    const r = computePayslip(input({ adjustments: [{ ...allowance("DED_OTHER", 3000), kind: "DEDUCTION" }] }));
    expect(r.warnings.join()).toMatch(/50%/);
  });

  it("warns when basic is below minimum wage for full-time staff", () => {
    expect(computePayslip(input({}, { basicSalary: 1500 })).warnings.join()).toMatch(/minimum wage/);
    expect(computePayslip(input({}, { basicSalary: 1500, employmentType: "INTERN" })).warnings).toHaveLength(0);
  });

  it("line ordering: earnings, deductions, then employer contributions", () => {
    const r = computePayslip(input());
    const kinds = r.lines.map((l) => l.kind);
    expect(kinds.indexOf("DEDUCTION")).toBeGreaterThan(kinds.lastIndexOf("EARNING"));
    expect(kinds.indexOf("EMPLOYER")).toBeGreaterThan(kinds.lastIndexOf("DEDUCTION"));
  });
});
