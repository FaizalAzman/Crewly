import { describe, expect, it } from "vitest";
import { calcEpf, epfBandWage, epfRates } from "@/lib/statutory/epf";

const citizen = (wages: number, age = 30) => calcEpf({ wages, age, citizenship: "CITIZEN" });

describe("EPF band wage (Third Schedule)", () => {
  it.each([
    [0, 0],
    [10, 0],
    [10.01, 20],
    [20, 20],
    [20.01, 40],
    [2990, 3000],
    [3000, 3000],
    [3000.01, 3020],
    [5000, 5000],
    [5000.01, 5100],
    [19999.99, 20000],
    [20000, 20000],
    [20000.5, 20000.5],
  ])("wage %s → band %s", (wage, band) => {
    expect(epfBandWage(wage)).toBe(band);
  });
});

describe("EPF rates", () => {
  it("citizen below 60 earning ≤ RM5,000: 11% / 13%", () => {
    expect(epfRates(5000, 59, "CITIZEN")).toMatchObject({ ee: 11, er: 13 });
  });
  it("citizen below 60 earning > RM5,000: 11% / 12%", () => {
    expect(epfRates(5000.01, 30, "CITIZEN")).toMatchObject({ ee: 11, er: 12 });
  });
  it("citizen aged 60+: 0% / 4%", () => {
    expect(epfRates(3000, 60, "CITIZEN")).toMatchObject({ ee: 0, er: 4 });
  });
  it("PR aged 60+: 5.5% / 6.5%", () => {
    expect(epfRates(3000, 65, "PR")).toMatchObject({ ee: 5.5, er: 6.5 });
  });
  it("PR below 60 uses citizen rates", () => {
    expect(epfRates(3000, 40, "PR")).toMatchObject({ ee: 11, er: 13 });
  });
  it("non-citizen: 2% / 2% regardless of age or wage", () => {
    expect(epfRates(9000, 45, "FOREIGNER")).toMatchObject({ ee: 2, er: 2 });
    expect(epfRates(1700, 62, "FOREIGNER")).toMatchObject({ ee: 2, er: 2 });
  });
});

describe("EPF contributions", () => {
  it("RM3,000 → EE RM330, ER RM390", () => {
    expect(citizen(3000)).toMatchObject({ employee: 330, employer: 390 });
  });
  it("RM2,990 falls in the RM2,980.01–3,000 band", () => {
    expect(citizen(2990)).toMatchObject({ employee: 330, employer: 390 });
  });
  it("minimum wage RM1,700 → EE RM187, ER RM221", () => {
    expect(citizen(1700)).toMatchObject({ employee: 187, employer: 221 });
  });
  it("rounds up to the next ringgit: RM4,321 → band 4,340 → EE 478, ER 565", () => {
    expect(citizen(4321)).toMatchObject({ employee: 478, employer: 565, bandWage: 4340 });
  });
  it("RM5,000 is the last 13% band", () => {
    expect(citizen(5000)).toMatchObject({ employee: 550, employer: 650 });
  });
  it("RM5,000.01 moves to RM100 bands at 12% employer", () => {
    expect(citizen(5000.01)).toMatchObject({ employee: 561, employer: 612 });
  });
  it("RM20,000 → EE 2,200, ER 2,400", () => {
    expect(citizen(20000)).toMatchObject({ employee: 2200, employer: 2400 });
  });
  it("above RM20,000 uses exact % rounded up: RM20,000.50 → 2,201 / 2,401", () => {
    expect(citizen(20000.5)).toMatchObject({ employee: 2201, employer: 2401 });
  });
  it("wages ≤ RM10 attract no contribution", () => {
    expect(citizen(10)).toMatchObject({ employee: 0, employer: 0 });
  });
  it("RM15 → RM3 / RM3 (lowest band)", () => {
    expect(citizen(15)).toMatchObject({ employee: 3, employer: 3 });
  });
  it("citizen aged 60 → EE 0, ER 4%", () => {
    expect(citizen(3000, 60)).toMatchObject({ employee: 0, employer: 120 });
  });
  it("PR aged 61 → EE 165, ER 195", () => {
    expect(calcEpf({ wages: 3000, age: 61, citizenship: "PR" })).toMatchObject({ employee: 165, employer: 195 });
  });
  it("foreign worker RM3,000 → RM60 / RM60", () => {
    expect(calcEpf({ wages: 3000, age: 30, citizenship: "FOREIGNER" })).toMatchObject({ employee: 60, employer: 60 });
  });
  it("honours voluntary higher employee rate", () => {
    expect(calcEpf({ wages: 3000, age: 30, citizenship: "CITIZEN", employeeRateOverride: 13 })).toMatchObject({
      employee: 390,
      employer: 390,
    });
  });
  it("does not suffer floating point drift (330, not 331)", () => {
    for (const w of [1000, 2000, 3000, 4000, 4500]) {
      expect(citizen(w).employee).toBe(Math.ceil((w * 11) / 100));
    }
  });
  it("negative wages are treated as zero", () => {
    expect(citizen(-100)).toMatchObject({ employee: 0, employer: 0 });
  });
});
