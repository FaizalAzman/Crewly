import { describe, expect, it } from "vitest";
import { annualTax, calcPcb, childReliefTotal, mrb, pcbCategory, RELIEF, TAX_BANDS } from "@/lib/statutory/pcb";

const jan = (Y1: number, K1: number, extra: Partial<Parameters<typeof calcPcb>[0]> = {}) =>
  calcPcb({ month: 1, resident: true, category: 1, Y: 0, K: 0, Y1, K1, ...extra });

describe("Tax schedule (YA2023 onwards)", () => {
  it("has contiguous bands", () => {
    for (let i = 1; i < TAX_BANDS.length; i++) expect(TAX_BANDS[i].from).toBe(TAX_BANDS[i - 1].to);
  });
  it("taxAtFrom equals cumulative tax of previous bands", () => {
    for (let i = 1; i < TAX_BANDS.length; i++) {
      const p = TAX_BANDS[i - 1];
      expect(TAX_BANDS[i].taxAtFrom).toBeCloseTo(p.taxAtFrom + (p.to - p.from) * p.rate, 6);
    }
  });
  it.each([
    [5000, 0],
    [20000, 150 - 400 < 0 ? 0 : 0],
    [35000, 600 - 400],
    [50000, 1500],
    [70000, 3700],
    [100000, 9400],
  ])("annual tax on RM%s (category 1) = RM%s", (ci, tax) => {
    expect(annualTax(ci, 1)).toBeCloseTo(tax, 2);
  });
  it("rebate of RM400 applies only up to RM35,000", () => {
    expect(annualTax(35000, 1)).toBe(200);
    expect(annualTax(35001, 1)).toBeCloseTo(600.06, 2);
  });
  it("category 2 gets an extra RM400 spouse rebate", () => {
    expect(mrb(30000, 2).B).toBe(150 - 800);
    expect(mrb(30000, 1).B).toBe(150 - 400);
    expect(mrb(30000, 3).B).toBe(150 - 400);
  });
});

describe("PCB category", () => {
  it("single → 1", () => expect(pcbCategory("SINGLE", false, 0)).toBe(1));
  it("married, spouse not working → 2", () => expect(pcbCategory("MARRIED", false, 2)).toBe(2));
  it("married, spouse working → 3", () => expect(pcbCategory("MARRIED", true, 0)).toBe(3));
  it("divorced / widowed → 3", () => {
    expect(pcbCategory("DIVORCED", false, 0)).toBe(3);
    expect(pcbCategory("WIDOWED", false, 1)).toBe(3);
  });
  it("single parent with children → 3", () => expect(pcbCategory("SINGLE", false, 1)).toBe(3));
});

describe("Child relief", () => {
  it("under 18 → RM2,000", () => expect(childReliefTotal([{ age: 5, studying: false, disabled: false }])).toBe(2000));
  it("18+ in higher education → RM8,000", () => expect(childReliefTotal([{ age: 20, studying: true, disabled: false }])).toBe(8000));
  it("18+ not studying → nil", () => expect(childReliefTotal([{ age: 20, studying: false, disabled: false }])).toBe(0));
  it("disabled → RM8,000; disabled and studying → RM16,000", () => {
    expect(childReliefTotal([{ age: 10, studying: false, disabled: true }])).toBe(8000);
    expect(childReliefTotal([{ age: 19, studying: true, disabled: true }])).toBe(16000);
  });
  it("sums multiple children", () => {
    expect(
      childReliefTotal([
        { age: 3, studying: false, disabled: false },
        { age: 7, studying: false, disabled: false },
        { age: 19, studying: true, disabled: false },
      ]),
    ).toBe(12000);
  });
});

describe("PCB — normal remuneration", () => {
  it("RM5,000 single in January → RM110.00", () => {
    const r = jan(5000, 550);
    expect(r.chargeableIncome).toBeCloseTo(47000, 0);
    expect(r.normal).toBe(110);
    expect(r.netPayable).toBe(110);
  });
  it("RM4,000 single → RM16.70 (rounded up to 5 sen)", () => {
    expect(jan(4000, 440).netPayable).toBe(16.7);
  });
  it("RM3,500 single → below RM10 so nil", () => {
    expect(jan(3500, 385).netPayable).toBe(0);
  });
  it("RM2,500 single → nil (rebate wipes out tax)", () => {
    expect(jan(2500, 275).netPayable).toBe(0);
  });
  it("category 2 (non-working spouse) pays less than category 1", () => {
    const c1 = jan(8000, 880).netPayable;
    const c2 = jan(8000, 880, { category: 2 }).netPayable;
    expect(c2).toBeLessThan(c1);
  });
  it("child relief reduces PCB", () => {
    const none = jan(8000, 880, { category: 3 }).netPayable;
    const two = jan(8000, 880, { category: 3, childRelief: 4000 }).netPayable;
    expect(two).toBeLessThan(none);
  });
  it("disabled individual relief reduces PCB", () => {
    expect(jan(8000, 880, { disabledSelf: true }).netPayable).toBeLessThan(jan(8000, 880).netPayable);
  });
  it("disabled spouse relief only applies for category 2", () => {
    expect(jan(8000, 880, { category: 3, disabledSpouse: true }).netPayable).toBe(jan(8000, 880, { category: 3 }).netPayable);
    expect(jan(8000, 880, { category: 2, disabledSpouse: true }).netPayable).toBeLessThan(jan(8000, 880, { category: 2 }).netPayable);
  });
  it("TP1 reliefs (LP1) reduce PCB", () => {
    expect(jan(8000, 880, { LP1: 2500 }).netPayable).toBeLessThan(jan(8000, 880).netPayable);
  });
  it("EPF relief is capped at RM4,000 a year", () => {
    const r = calcPcb({ month: 6, resident: true, category: 1, Y: 5 * 20000, K: 5 * 2200, Y1: 20000, K1: 2200 });
    expect(r.breakdown.K).toBe(RELIEF.epfCap);
    expect(r.breakdown.K1).toBe(0);
    expect(r.breakdown.K2).toBe(0);
  });
  it("K2 (projected EPF) never exceeds current month EPF", () => {
    const r = jan(3000, 330);
    expect(r.breakdown.K2).toBeLessThanOrEqual(330);
  });
  it("PCB already paid (X) is spread over remaining months", () => {
    // Pay exactly the same salary every month → monthly PCB should stay ~constant.
    let X = 0;
    let Y = 0;
    let K = 0;
    const amounts: number[] = [];
    for (let m = 1; m <= 12; m++) {
      const r = calcPcb({ month: m, resident: true, category: 1, Y, K, Y1: 9000, K1: 990, X });
      amounts.push(r.netPayable);
      X += r.netPayable;
      Y += 9000;
      K += 990;
    }
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    expect(max - min).toBeLessThan(40); // drifts only because of the RM4,000 EPF cap
    // Total paid over the year approximates the annual tax.
    const annual = calcPcb({ month: 12, resident: true, category: 1, Y: 11 * 9000, K: 4000, Y1: 9000, K1: 0, X: 0 }).estimatedAnnualTax;
    expect(Math.abs(X - annual)).toBeLessThan(5);
  });
  it("December (n = 0) computes the balance of tax for the year", () => {
    const r = calcPcb({ month: 12, resident: true, category: 1, Y: 11 * 6000, K: 4000, Y1: 6000, K1: 0, X: 0 });
    expect(r.breakdown.n).toBe(0);
    expect(r.netPayable).toBeGreaterThan(1000);
  });
  it("over-deducted PCB never produces a negative amount", () => {
    expect(calcPcb({ month: 6, resident: true, category: 1, Y: 25000, K: 2750, Y1: 5000, K1: 550, X: 50000 }).netPayable).toBe(0);
  });
});

describe("PCB — zakat", () => {
  it("zakat is deducted from PCB", () => {
    expect(jan(5000, 550, { zakatCurrent: 50 }).netPayable).toBe(60);
  });
  it("zakat larger than PCB brings PCB to nil (not negative)", () => {
    expect(jan(5000, 550, { zakatCurrent: 500 }).netPayable).toBe(0);
  });
});

describe("PCB — additional remuneration (bonus)", () => {
  it("RM5,000 salary + RM5,000 bonus in January → additional RM400.00", () => {
    const r = jan(5000, 550, { Yt: 5000, Kt: 550 });
    expect(r.normal).toBe(110);
    expect(r.additional).toBe(400);
    expect(r.netPayable).toBe(510);
  });
  it("bonus never reduces normal PCB", () => {
    const base = jan(7000, 770);
    const withBonus = jan(7000, 770, { Yt: 10000, Kt: 1100 });
    expect(withBonus.normal).toBe(base.normal);
    expect(withBonus.additional).toBeGreaterThan(0);
  });
});

describe("PCB — non-resident", () => {
  it("flat 30% with no reliefs", () => {
    const r = calcPcb({ month: 3, resident: false, category: 1, Y: 0, K: 0, Y1: 5000, K1: 0 });
    expect(r.netPayable).toBe(1500);
  });
  it("30% also applies to bonus", () => {
    const r = calcPcb({ month: 3, resident: false, category: 1, Y: 0, K: 0, Y1: 5000, K1: 0, Yt: 1000 });
    expect(r.total).toBe(1800);
  });
});

describe("PCB — rounding", () => {
  it("always a multiple of 5 sen", () => {
    for (let s = 4000; s <= 30000; s += 777) {
      const epf = Math.ceil(s * 0.11);
      const r = jan(s, epf);
      expect(Math.round(r.netPayable * 100) % 5).toBe(0);
    }
  });
  it("monotonic: higher salary never yields lower PCB", () => {
    let prev = 0;
    for (let s = 2000; s <= 40000; s += 250) {
      const r = jan(s, Math.ceil(s * 0.11));
      expect(r.netPayable).toBeGreaterThanOrEqual(prev);
      prev = r.netPayable;
    }
  });
});
