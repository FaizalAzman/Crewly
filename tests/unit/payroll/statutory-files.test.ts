import { describe, expect, it } from "vitest";
import { bankFile, cp39File, epfFile, socsoEisFile, summarize, type SlipRow } from "@/lib/payroll/statutory-files";

const row = (o: Partial<SlipRow> = {}): SlipRow => ({
  employeeNo: "E001",
  fullName: "Ahmad bin Ali",
  icNo: "900101-14-5677",
  passportNo: null,
  epfNo: "12345678",
  socsoNo: "900101145677",
  taxNo: "SG 1234567890",
  bankName: "Maybank",
  bankAccountNo: "1122334455",
  citizenship: "CITIZEN",
  epfWages: 5000,
  socsoWages: 5000,
  epfEE: 550,
  epfER: 650,
  socsoEE: 24.75,
  socsoER: 86.65,
  eisEE: 9.9,
  eisER: 9.9,
  pcb: 110,
  zakat: 0,
  hrdf: 50,
  netPay: 4305.35,
  grossPay: 5000,
  ...o,
});

const lines = (csv: string) => csv.split("\n");

describe("KWSP contribution file", () => {
  it("has a header and one line per contributing employee", () => {
    const csv = epfFile([row(), row({ epfEE: 0, epfER: 0, employeeNo: "E002" })], "019283746", "2026-09");
    expect(lines(csv)).toHaveLength(2);
    expect(lines(csv)[0]).toMatch(/^EMPLOYER_NO,CONTRIBUTION_MONTH,MEMBER_NO/);
  });
  it("uses MMYYYY, strips NRIC dashes and uppercases names", () => {
    const l = lines(epfFile([row()], "019283746", "2026-09"))[1];
    expect(l).toBe("019283746,092026,12345678,900101145677,AHMAD BIN ALI,5000.00,650.00,550.00");
  });
  it("falls back to passport for foreigners", () => {
    const l = lines(epfFile([row({ icNo: null, passportNo: "NP123" })], "1", "2026-01"))[1];
    expect(l).toContain(",NP123,");
  });
});

describe("PERKESO SOCSO + EIS file", () => {
  it("caps wages at RM6,000 and totals the four shares", () => {
    const l = lines(socsoEisFile([row({ socsoWages: 9000, socsoER: 104.15, socsoEE: 29.75, eisER: 11.9, eisEE: 11.9 })], "E1000", "2026-09"))[1];
    expect(l.split(",")[4]).toBe("6000.00");
    expect(l.endsWith(",157.70")).toBe(true);
  });
  it("omits employees with no contributions", () => {
    expect(lines(socsoEisFile([row({ socsoER: 0, socsoEE: 0, eisER: 0, eisEE: 0 })], "E1", "2026-09"))).toHaveLength(1);
  });
});

describe("LHDN CP39 file", () => {
  it("includes only employees with PCB and the employer E number", () => {
    const csv = cp39File([row(), row({ pcb: 0, employeeNo: "E002" })], "E 9123456708", "2026-09");
    expect(lines(csv)).toHaveLength(2);
    expect(lines(csv)[1]).toMatch(/^E 9123456708,2026,09,SG 1234567890,AHMAD BIN ALI,900101145677,,MY,110.00,0.00,E001$/);
  });
});

describe("Bank payment file", () => {
  it("one line per positive net pay with a reference", () => {
    const csv = bankFile([row(), row({ netPay: 0, employeeNo: "E002" })], "2026-09");
    expect(lines(csv)).toHaveLength(2);
    expect(lines(csv)[1]).toMatch(/^SAL202609E001,AHMAD BIN ALI,Maybank,1122334455,4305.35,/);
  });
});

describe("summarize", () => {
  it("totals every statutory column", () => {
    const s = summarize([row(), row()]);
    expect(s).toMatchObject({ headcount: 2, epfEE: 1100, epfER: 1300, pcb: 220, hrdf: 100, gross: 10000 });
    expect(s.socsoER).toBeCloseTo(173.3, 2);
  });
});
