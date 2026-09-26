import { describe, expect, it } from "vitest";
import { MIN_SEATS, PLANS, quoteFor, sandboxGateway, tenantAccess } from "@/server/services/subscription.service";
import { monthlyRevenue, assertPlatformAdmin } from "@/server/services/platform.service";
import { validateLetterhead } from "@/server/services/letterhead.service";
import { MAX_UPLOAD_BYTES, validateUpload } from "@/server/services/upload.service";
import { assertNoEscalation } from "@/server/services/roles.service";
import { hashToken } from "@/server/services/auth.service";
import { pdfText } from "@/server/pdf/common";
import { invoicePdf } from "@/server/pdf/invoice";
import { letterPdf } from "@/server/pdf/letter";
import { ROLE_PERMISSIONS } from "@/lib/permissions";
import type { Ctx } from "@/server/types";

const NOW = new Date("2026-06-15T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86400000);

describe("tenantAccess state machine", () => {
  const base = { trialEndsAt: null, currentPeriodEnd: null };

  it("trial with days left is writable and counts down", () => {
    const a = tenantAccess({ ...base, subscriptionStatus: "TRIALING", trialEndsAt: day(5) }, NOW);
    expect(a).toMatchObject({ state: "TRIAL", writable: true, canLogin: true, daysLeft: 5 });
    expect(a.message).toMatch(/5 days left/);
    expect(tenantAccess({ ...base, subscriptionStatus: "TRIALING", trialEndsAt: day(0.5) }, NOW).message).toMatch(/1 day left/);
  });

  it("an ended trial is read-only but can still log in (so they can pay)", () => {
    expect(tenantAccess({ ...base, subscriptionStatus: "TRIALING", trialEndsAt: day(-1) }, NOW)).toMatchObject({ state: "TRIAL_ENDED", writable: false, canLogin: true });
  });

  it("active subscription is writable until its period ends, then past due", () => {
    expect(tenantAccess({ ...base, subscriptionStatus: "ACTIVE", currentPeriodEnd: day(20) }, NOW)).toMatchObject({ state: "ACTIVE", writable: true });
    expect(tenantAccess({ ...base, subscriptionStatus: "ACTIVE", currentPeriodEnd: day(-2) }, NOW)).toMatchObject({ state: "PAST_DUE", writable: false, canLogin: true });
    expect(tenantAccess({ ...base, subscriptionStatus: "PAST_DUE" }, NOW)).toMatchObject({ state: "PAST_DUE", writable: false });
  });

  it("cancelled keeps full access for the paid period only", () => {
    expect(tenantAccess({ ...base, subscriptionStatus: "CANCELLED", currentPeriodEnd: day(3) }, NOW)).toMatchObject({ state: "CANCELLED_GRACE", writable: true, daysLeft: 3 });
    expect(tenantAccess({ ...base, subscriptionStatus: "CANCELLED", currentPeriodEnd: day(-3) }, NOW)).toMatchObject({ state: "CANCELLED", writable: false, canLogin: true });
  });

  it("suspended and closed workspaces can't log in at all", () => {
    const s = tenantAccess({ ...base, subscriptionStatus: "SUSPENDED", suspendedReason: "Chargeback" }, NOW);
    expect(s).toMatchObject({ state: "SUSPENDED", writable: false, canLogin: false });
    expect(s.message).toContain("Chargeback");
    // closedAt wins over any status
    expect(tenantAccess({ ...base, subscriptionStatus: "ACTIVE", currentPeriodEnd: day(100), closedAt: day(-1) }, NOW)).toMatchObject({ state: "CLOSED", canLogin: false });
  });
});

describe("pricing", () => {
  it("bills at least the minimum seats", () => {
    const q = quoteFor("GROWTH", 3, "MONTHLY");
    expect(q.seats).toBe(MIN_SEATS);
    expect(q.subtotal).toBe(MIN_SEATS * PLANS.GROWTH.price);
  });

  it("yearly is 10× monthly (2 months free) plus 8% SST", () => {
    const q = quoteFor("ENTERPRISE", 44, "YEARLY");
    expect(q.subtotal).toBe(44 * 18 * 10);
    expect(q.sst).toBe(633.6);
    expect(q.total).toBe(8553.6);
  });

  it("MRR spreads yearly plans over 12 months and ignores non-paying workspaces", () => {
    expect(monthlyRevenue({ plan: "GROWTH", billingCycle: "MONTHLY", subscriptionStatus: "ACTIVE", seats: 0 }, 20)).toBe(240);
    expect(monthlyRevenue({ plan: "GROWTH", billingCycle: "YEARLY", subscriptionStatus: "ACTIVE", seats: 0 }, 18)).toBe(180);
    expect(monthlyRevenue({ plan: "STARTER", billingCycle: "MONTHLY", subscriptionStatus: "ACTIVE", seats: 0 }, 4)).toBe(60);
    expect(monthlyRevenue({ plan: "GROWTH", billingCycle: "MONTHLY", subscriptionStatus: "TRIALING", seats: 0 }, 50)).toBe(0);
    expect(monthlyRevenue({ plan: "GROWTH", billingCycle: "MONTHLY", subscriptionStatus: "SUSPENDED", seats: 0 }, 50)).toBe(0);
  });
});

describe("sandbox payment gateway", () => {
  it("approves FPX and ordinary cards with a reference", async () => {
    const r = await sandboxGateway.charge({ amount: 100, currency: "MYR", description: "x", method: "FPX" });
    expect(r.ok).toBe(true);
    expect(r.reference).toMatch(/^SBX-/);
    expect((await sandboxGateway.charge({ amount: 100, currency: "MYR", description: "x", method: "CARD", instrument: "4242 4242 4242 4242" })).ok).toBe(true);
  });

  it("declines the documented test card and zero amounts", async () => {
    const r = await sandboxGateway.charge({ amount: 100, currency: "MYR", description: "x", method: "CARD", instrument: "4000 0000 0000 0002" });
    expect(r).toMatchObject({ ok: false });
    expect(r.message).toMatch(/declined/);
    expect((await sandboxGateway.charge({ amount: 0, currency: "MYR", description: "x", method: "FPX" })).ok).toBe(false);
  });
});

describe("platform operator guard", () => {
  it("only platform admins pass", () => {
    expect(() => assertPlatformAdmin(null)).toThrow(/operators only/);
    expect(() => assertPlatformAdmin({ userId: "u", name: "x", platformAdmin: false })).toThrow();
    expect(() => assertPlatformAdmin({ userId: "u", name: "x", platformAdmin: true })).not.toThrow();
  });
});

describe("letterhead validation", () => {
  it("accepts a sensible letterhead", () => {
    expect(() => validateLetterhead({ letterheadColor: "#5B3FD6", letterheadLayout: "CENTER", letterheadFooter: "Private & confidential" })).not.toThrow();
  });
  it("rejects bad colours, layouts and over-long text", () => {
    expect(() => validateLetterhead({ letterheadColor: "purple" })).toThrow(/hex/);
    expect(() => validateLetterhead({ letterheadColor: "#FFF" })).toThrow(/hex/);
    expect(() => validateLetterhead({ letterheadLayout: "JUSTIFY" })).toThrow(/Layout/);
    expect(() => validateLetterhead({ letterheadFooter: "x".repeat(301) })).toThrow(/300/);
    expect(() => validateLetterhead({ letterheadContact: "x".repeat(151) })).toThrow(/150/);
  });
});

describe("upload validation", () => {
  it("accepts PDFs and images and sanitises the file name", () => {
    expect(validateUpload({ name: "MC Dr. Tan (1).pdf", size: 1000, type: "application/pdf" }).safeName).toBe("MC Dr. Tan _1_.pdf");
    expect(validateUpload({ name: "../../etc/passwd.png", size: 10, type: "image/png" }).safeName).not.toContain("/");
  });
  it("rejects empty, oversized and unsupported files", () => {
    expect(() => validateUpload({ name: "a.pdf", size: 0, type: "application/pdf" })).toThrow(/empty/);
    expect(() => validateUpload({ name: "a.pdf", size: MAX_UPLOAD_BYTES + 1, type: "application/pdf" })).toThrow(/5 MB/);
    expect(() => validateUpload({ name: "a.exe", size: 10, type: "application/x-msdownload" })).toThrow(/Upload a PDF/);
    expect(() => validateUpload({ name: "a.html", size: 10, type: "text/html" })).toThrow();
  });
});

describe("custom role escalation guard", () => {
  const ctx = (role: string, permissions: string[]) => ({ role, permissions }) as unknown as Ctx;
  it("owners may grant anything", () => {
    expect(() => assertNoEscalation(ctx("OWNER", []), ["billing.manage"])).not.toThrow();
  });
  it("others may only grant permissions they hold", () => {
    const hr = ctx("HR_ADMIN", [...ROLE_PERMISSIONS.HR_ADMIN] as string[]);
    expect(() => assertNoEscalation(hr, ["employee.view"])).not.toThrow();
    expect(() => assertNoEscalation(hr, ["employee.view", "billing.manage"])).toThrow(/billing\.manage/);
  });
});

describe("tokens & PDF text", () => {
  it("token hashes are deterministic sha256 hex and never equal the token", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });

  it("pdfText maps smart punctuation and drops glyphs the standard fonts can't draw", () => {
    expect(pdfText("It’s “fine” → ok 🎉")).toBe(`It's "fine" -> ok `);
    expect(pdfText(null)).toBe("");
  });
});

describe("true PDF output", () => {
  const isPdf = (b: Buffer) => b.subarray(0, 5).toString() === "%PDF-" && b.subarray(-6).toString().includes("%%EOF");

  it("renders an invoice", async () => {
    const buf = await invoicePdf({
      number: "INV-2026-TEST-0001", issuedAt: NOW, paidAt: NOW, status: "PAID", customer: { name: "Kopi Kaki Café Sdn Bhd", address: "Georgetown", regNo: "202001012345" },
      plan: "GROWTH", cycle: "MONTHLY", seats: 10, unitPrice: 12, amount: 120, sst: 9.6, paymentRef: "SBX-1",
    });
    expect(isPdf(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1500);
  });

  it("renders a multi-paragraph letter on letterhead with a draft watermark", async () => {
    const buf = await letterPdf({
      title: "Warning Letter",
      content: "Dear Ahmad,\n\n" + "This is a formal warning regarding punctuality. ".repeat(80) + "\n\nYours sincerely,\n[signature]\nAisyah",
      status: "DRAFT",
      company: { tenantId: "t", name: "Lumen Digital Sdn Bhd", regNo: "201901012345", address: "Bangsar South", phone: null, letterheadLogo: null, letterheadColor: "#5B3FD6", letterheadLayout: "LEFT", letterheadContact: "people@lumen.my", letterheadFooter: "Private & confidential", signatureImage: null },
    });
    expect(isPdf(buf)).toBe(true);
  });
});
