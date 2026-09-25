import { describe, expect, it } from "vitest";
import { calcEis, calcSocso, socsoCategory, SOCSO_CEILING } from "@/lib/statutory/socso";

const cat1 = (wages: number) => calcSocso({ wages, age: 30, citizenship: "CITIZEN" });

describe("SOCSO category", () => {
  it("citizen below 60 → Category 1", () => expect(socsoCategory(59, "CITIZEN")).toBe(1));
  it("citizen 60+ → Category 2", () => expect(socsoCategory(60, "CITIZEN")).toBe(2));
  it("PR below 60 → Category 1", () => expect(socsoCategory(35, "PR")).toBe(1));
  it("foreign worker → Employment Injury scheme", () => expect(socsoCategory(30, "FOREIGNER")).toBe("FOREIGN"));
});

describe("SOCSO Category 1 contributions (ceiling RM6,000)", () => {
  it("ceiling is RM6,000", () => expect(SOCSO_CEILING).toBe(6000));
  it.each([
    [3000, 51.65, 14.75],
    [2950, 51.65, 14.75],
    [1700, 28.85, 8.25],
    [2000, 34.15, 9.75],
    [450, 7.85, 2.25],
    [350, 6.15, 1.75],
    [6000, 104.15, 29.75],
  ])("wages RM%s → ER %s / EE %s", (w, er, ee) => {
    const r = cat1(w);
    expect(r.employer).toBeCloseTo(er, 2);
    expect(r.employee).toBeCloseTo(ee, 2);
  });
  it("wages above the ceiling are capped at the top band", () => {
    expect(cat1(15000)).toMatchObject({ employer: 104.15, employee: 29.75 });
  });
  it("low bands use the irregular schedule values", () => {
    expect(cat1(25)).toMatchObject({ employer: 0.4, employee: 0.1 });
    expect(cat1(250)).toMatchObject({ employer: 4.35, employee: 1.25 });
  });
  it("no wages → no contribution", () => {
    expect(cat1(0)).toMatchObject({ employer: 0, employee: 0 });
  });
  it("employee share is exactly 0.5% of the band mid-point", () => {
    for (let w = 301; w <= 6000; w += 53) {
      const mid = Math.ceil(w / 100) * 100 - 50;
      expect(cat1(w).employee).toBeCloseTo(mid * 0.005, 2);
    }
  });
  it("contributions are always multiples of 5 sen", () => {
    for (let w = 301; w <= 6000; w += 37) {
      const r = cat1(w);
      expect(Math.round(r.employer * 100) % 5).toBe(0);
      expect(Math.round(r.employee * 100) % 5).toBe(0);
    }
  });
  it("contributions never decrease as wages rise", () => {
    let prev = 0;
    for (let w = 1; w <= 7000; w += 13) {
      const er = cat1(w).employer;
      expect(er).toBeGreaterThanOrEqual(prev);
      prev = er;
    }
  });
});

describe("SOCSO Category 2 & foreign workers", () => {
  it("60+ pays employer 1.25% only", () => {
    expect(calcSocso({ wages: 3000, age: 62, citizenship: "CITIZEN" })).toMatchObject({ category: 2, employer: 36.85, employee: 0 });
  });
  it("foreign worker: employer 1.25%, employee nil", () => {
    expect(calcSocso({ wages: 3000, age: 28, citizenship: "FOREIGNER" })).toMatchObject({ category: "FOREIGN", employer: 36.85, employee: 0 });
  });
  it("Category 2 max contribution at the ceiling", () => {
    expect(calcSocso({ wages: 9000, age: 65, citizenship: "CITIZEN" }).employer).toBeCloseTo(74.35, 2);
  });
});

describe("EIS", () => {
  it.each([
    [3000, 5.9],
    [1700, 3.3],
    [6000, 11.9],
    [12000, 11.9],
    [350, 0.7],
    [25, 0.05],
  ])("wages RM%s → RM%s each", (w, amt) => {
    const r = calcEis({ wages: w, age: 30, citizenship: "CITIZEN" });
    expect(r.eligible).toBe(true);
    expect(r.employee).toBeCloseTo(amt, 2);
    expect(r.employer).toBeCloseTo(amt, 2);
  });
  it("not applicable to foreign workers", () => {
    expect(calcEis({ wages: 3000, age: 30, citizenship: "FOREIGNER" })).toMatchObject({ eligible: false, employee: 0, employer: 0 });
  });
  it("not applicable at age 60 and above", () => {
    expect(calcEis({ wages: 3000, age: 60, citizenship: "CITIZEN" }).eligible).toBe(false);
  });
  it("not applicable below age 18", () => {
    expect(calcEis({ wages: 1800, age: 17, citizenship: "CITIZEN" }).eligible).toBe(false);
  });
  it("PR is covered", () => {
    expect(calcEis({ wages: 3000, age: 30, citizenship: "PR" }).eligible).toBe(true);
  });
});
