import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { ctxFromUser } from "@/server/ctx";
import { authenticate, requestPasswordReset, resetPassword, issueToken, signup } from "@/server/services/auth.service";
import { assertCanAddEmployees, assertTenantWritable, cancelSubscription, checkout, type PaymentGateway } from "@/server/services/subscription.service";
import { extendTrial, listWorkspaces, platformMetrics, reactivateWorkspace, setWorkspacePlan, suspendWorkspace, type PlatformActor } from "@/server/services/platform.service";
import { quickAddDepartments, setupProgress } from "@/server/services/onboarding.service";
import { changeUserRole, closeWorkspace, exportWorkspace, inviteUser } from "@/server/services/settings.service";
import { deleteCustomRole, saveCustomRole } from "@/server/services/roles.service";
import { updateLetterhead } from "@/server/services/letterhead.service";
import type { Ctx } from "@/server/types";
import { makeWorld, type World } from "./factory";

const email = () => `saas-${randomUUID().slice(0, 8)}@startup.my`;
const PASSWORD = "supersecret";

/** A fresh self-serve customer: signs up, gets a trial and an owner ctx. */
async function customer(companyName = `Kedai ${randomUUID().slice(0, 6)} Sdn Bhd`) {
  const e = email();
  const { tenant, user } = await signup({ companyName, name: "Founder", email: e, password: PASSWORD, state: "SELANGOR" });
  return { tenant, user, email: e, owner: ctxFromUser(user) as Ctx };
}

let operator: PlatformActor;
beforeAll(async () => {
  const hq = await prisma.tenant.create({ data: { name: "Crewly HQ test", slug: `hq-${randomUUID().slice(0, 8)}`, subscriptionStatus: "ACTIVE" } });
  const u = await prisma.user.create({ data: { tenantId: hq.id, email: `ops-${randomUUID().slice(0, 8)}@crewly.my`, name: "Ops", role: "OWNER", platformAdmin: true, passwordHash: "x" } });
  operator = { userId: u.id, name: u.name, platformAdmin: true };
});

describe("Self-serve sign-up → trial", () => {
  it("starts a 14-day trial and sends a welcome email pointing at setup", async () => {
    const c = await customer();
    expect(c.tenant.subscriptionStatus).toBe("TRIALING");
    const days = Math.round((c.tenant.trialEndsAt!.getTime() - Date.now()) / 86400000);
    expect(days).toBe(14);
    const mail = await prisma.outboundEmail.findFirstOrThrow({ where: { tenantId: c.tenant.id, kind: "WELCOME" } });
    expect(mail.to).toBe(c.email);
    expect(mail.body).toContain("/welcome");
  });

  it("setup checklist is derived from real data and advances as the customer works", async () => {
    const c = await customer();
    const before = await setupProgress(c.tenant.id, c.user.id);
    expect(before.steps.find((s) => s.key === "company")!.done).toBe(false);
    expect(before.steps.find((s) => s.key === "payroll")!.done).toBe(false);
    await prisma.company.updateMany({ where: { tenantId: c.tenant.id }, data: { regNo: "202601000001", epfNo: "1", socsoNo: "E1", taxNo: "E 1" } });
    const after = await setupProgress(c.tenant.id, c.user.id);
    expect(after.steps.find((s) => s.key === "company")!.done).toBe(true);
    expect(after.done).toBe(before.done + 1);
  });

  it("quick-add departments trims, de-duplicates and gives unique codes", async () => {
    const c = await customer();
    const existing = await prisma.department.count({ where: { tenantId: c.tenant.id } });
    const added = await quickAddDepartments(c.owner, "Finance, finance,\nFields Ops, Field Sales ,  ");
    expect(added).toBe(3);
    const depts = await prisma.department.findMany({ where: { tenantId: c.tenant.id } });
    expect(depts).toHaveLength(existing + 3);
    expect(new Set(depts.map((d) => d.code)).size).toBe(depts.length);
    expect(await quickAddDepartments(c.owner, "FINANCE")).toBe(0);
    await expect(quickAddDepartments(c.owner, " , ")).rejects.toThrow(/at least one/);
  });
});

describe("Access by subscription state", () => {
  it("an expired trial is read-only but the owner can still log in to pay", async () => {
    const c = await customer();
    await prisma.tenant.update({ where: { id: c.tenant.id }, data: { trialEndsAt: new Date(Date.now() - 86400000) } });
    await expect(assertTenantWritable(c.tenant.id)).rejects.toThrow(/trial has ended/);
    await expect(authenticate(c.email, PASSWORD)).resolves.toBeTruthy();
  });

  it("Starter caps active employees at 25", async () => {
    const w = await makeWorld(); // 2 active employees
    await prisma.tenant.update({ where: { id: w.tenantId }, data: { plan: "STARTER" } });
    await expect(assertCanAddEmployees(w.tenantId, 23)).resolves.toBeUndefined();
    await expect(assertCanAddEmployees(w.tenantId, 24)).rejects.toThrow(/up to 25/);
    await prisma.tenant.update({ where: { id: w.tenantId }, data: { plan: "GROWTH" } });
    await expect(assertCanAddEmployees(w.tenantId, 500)).resolves.toBeUndefined();
  });
});

describe("Checkout & billing", () => {
  let w: World;
  beforeAll(async () => {
    w = await makeWorld();
    await prisma.tenant.update({ where: { id: w.tenantId }, data: { subscriptionStatus: "TRIALING", trialEndsAt: new Date(Date.now() - 86400000), currentPeriodEnd: null } });
  });

  it("only billing managers can pay", async () => {
    await expect(checkout(w.hr, { plan: "GROWTH", cycle: "MONTHLY", method: "FPX" })).rejects.toThrow();
  });

  it("a declined card changes nothing", async () => {
    await expect(checkout(w.owner, { plan: "GROWTH", cycle: "MONTHLY", method: "CARD", instrument: "4000 0000 0000 0002" })).rejects.toThrow(/declined/);
    const t = await prisma.tenant.findUniqueOrThrow({ where: { id: w.tenantId } });
    expect(t.subscriptionStatus).toBe("TRIALING");
    expect(await prisma.invoice.count({ where: { tenantId: w.tenantId } })).toBe(0);
  });

  it("a successful payment activates, invoices at min seats + SST, emails a receipt and unlocks writes", async () => {
    const now = new Date("2026-06-10T00:00:00Z");
    const { invoice, periodEnd } = await checkout(w.owner, { plan: "GROWTH", cycle: "MONTHLY", method: "FPX" }, undefined, now);
    expect(invoice).toMatchObject({ status: "PAID", seats: 10, amount: 120, sst: 9.6, plan: "GROWTH", cycle: "MONTHLY" });
    expect(invoice.paymentRef).toMatch(/^SBX-/);
    expect(periodEnd.toISOString().slice(0, 10)).toBe("2026-07-10");
    const t = await prisma.tenant.findUniqueOrThrow({ where: { id: w.tenantId } });
    expect(t.subscriptionStatus).toBe("ACTIVE");
    await prisma.tenant.update({ where: { id: w.tenantId }, data: { currentPeriodEnd: new Date(Date.now() + 20 * 86400000) } });
    await expect(assertTenantWritable(w.tenantId)).resolves.toBeUndefined();
  });

  it("renewing while active extends from the current period end, not today", async () => {
    const t0 = await prisma.tenant.findUniqueOrThrow({ where: { id: w.tenantId } });
    const { periodEnd } = await checkout(w.owner, { plan: "GROWTH", cycle: "YEARLY", method: "FPX" });
    const expected = new Date(t0.currentPeriodEnd!);
    expected.setUTCFullYear(expected.getUTCFullYear() + 1);
    expect(periodEnd.toISOString()).toBe(expected.toISOString());
  });

  it("a gateway failure message is surfaced to the customer", async () => {
    const down: PaymentGateway = { charge: async () => ({ ok: false, reference: "", message: "Bank is offline" }) };
    await expect(checkout(w.owner, { plan: "GROWTH", cycle: "MONTHLY", method: "FPX" }, down)).rejects.toThrow(/Bank is offline/);
  });

  it("multiple legal entities need Enterprise", async () => {
    await prisma.company.create({ data: { tenantId: w.tenantId, name: "Second entity Sdn Bhd", state: "JOHOR" } });
    await expect(checkout(w.owner, { plan: "GROWTH", cycle: "MONTHLY", method: "FPX" })).rejects.toThrow(/Enterprise/);
    await expect(checkout(w.owner, { plan: "ENTERPRISE", cycle: "MONTHLY", method: "FPX" })).resolves.toBeTruthy();
  });

  it("cancelling keeps access until the paid period ends", async () => {
    await cancelSubscription(w.owner);
    const t = await prisma.tenant.findUniqueOrThrow({ where: { id: w.tenantId } });
    expect(t.subscriptionStatus).toBe("CANCELLED");
    await expect(assertTenantWritable(w.tenantId)).resolves.toBeUndefined();
    await expect(cancelSubscription(w.owner)).rejects.toThrow(/no active subscription/);
  });

  it("the owner receives receipts", async () => {
    const c = await customer();
    await checkout(c.owner, { plan: "STARTER", cycle: "MONTHLY", method: "FPX" });
    const mail = await prisma.outboundEmail.findFirstOrThrow({ where: { tenantId: c.tenant.id, kind: "BILLING" } });
    expect(mail.to).toBe(c.email);
    expect(mail.subject).toMatch(/Receipt INV-/);
  });
});

describe("Password reset & invites", () => {
  it("reset link works once, then is burned", async () => {
    const c = await customer();
    const { devLink } = await requestPasswordReset(c.email.toUpperCase());
    const token = new URL(devLink!, "http://x").searchParams.get("token")!;
    expect(await prisma.passwordResetToken.count({ where: { tokenHash: token } })).toBe(0); // only the hash is stored
    await expect(resetPassword(token, "short")).rejects.toThrow(/8 characters/);
    await resetPassword(token, "brand-new-pass");
    await expect(authenticate(c.email, "brand-new-pass")).resolves.toBeTruthy();
    await expect(authenticate(c.email, PASSWORD)).rejects.toThrow();
    await expect(resetPassword(token, "another-pass")).rejects.toThrow(/invalid or has expired/);
  });

  it("expired tokens are rejected; unknown emails reveal nothing", async () => {
    const c = await customer();
    const token = await issueToken(c.user.id, "RESET", 1);
    await prisma.passwordResetToken.updateMany({ where: { userId: c.user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(resetPassword(token, "brand-new-pass")).rejects.toThrow(/expired/);
    expect(await requestPasswordReset("nobody@nowhere.my")).toEqual({});
  });

  it("requests are throttled to 3 per 15 minutes", async () => {
    const c = await customer();
    for (let i = 0; i < 3; i++) expect((await requestPasswordReset(c.email)).devLink).toBeTruthy();
    expect(await requestPasswordReset(c.email)).toEqual({});
  });

  it("invited users get an email with a set-password link", async () => {
    const c = await customer();
    const invited = await inviteUser(c.owner, { name: "Hana HR", email: email(), roleKey: "HR_ADMIN", password: "temp-pass-1" });
    expect(invited.inviteLink).toMatch(/invite=1/);
    const mail = await prisma.outboundEmail.findFirstOrThrow({ where: { tenantId: c.tenant.id, kind: "INVITE" } });
    expect(mail.to).toBe(invited.email);
    const token = new URL(invited.inviteLink!, "http://x").searchParams.get("token")!;
    await resetPassword(token, "hana-own-pass");
    await expect(authenticate(invited.email, "hana-own-pass")).resolves.toBeTruthy();
  });
});

describe("Custom roles", () => {
  let w: World;
  beforeAll(async () => {
    w = await makeWorld();
  });

  it("HR can't create a role with permissions they don't have (billing)", async () => {
    await expect(saveCustomRole(w.hr, { name: "Sneaky", permissions: ["employee.view", "billing.manage"], scope: "ALL" })).rejects.toThrow(/billing\.manage/);
  });

  it("built-in names are reserved and empty roles rejected", async () => {
    await expect(saveCustomRole(w.owner, { name: "HR Admin", permissions: ["employee.view"], scope: "ALL" })).rejects.toThrow(/reserved/);
    await expect(saveCustomRole(w.owner, { name: "Nothing", permissions: ["not.a.permission"], scope: "ALL" })).rejects.toThrow(/at least one/);
  });

  it("a custom role can be assigned, drives permissions and can't be deleted while in use", async () => {
    const role = await saveCustomRole(w.owner, { name: "Recruiter", permissions: ["recruitment.manage", "employee.view"], scope: "TEAM" });
    const { id: empId, ctx } = await w.emp({}, { login: "EMPLOYEE" });
    expect(empId).toBeTruthy();
    await changeUserRole(w.owner, ctx!.userId, `CUSTOM:${role.id}`);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: ctx!.userId }, include: { customRole: true } });
    const rctx = ctxFromUser(u);
    expect(rctx.permissions).toContain("recruitment.manage");
    expect(rctx.permissions).not.toContain("payroll.manage");
    expect(rctx.scope).toBe("TEAM");
    await expect(deleteCustomRole(w.owner, role.id)).rejects.toThrow(/still have this role/);
    await changeUserRole(w.owner, ctx!.userId, "EMPLOYEE");
    await expect(deleteCustomRole(w.owner, role.id)).resolves.toBeUndefined();
  });

  it("a workspace always keeps an owner", async () => {
    const c = await customer();
    const hrUser = await inviteUser(c.owner, { name: "Second Owner", email: email(), roleKey: "OWNER", password: "temp-pass-1" });
    const hrCtx = ctxFromUser(hrUser);
    await changeUserRole(hrCtx, c.user.id, "HR_ADMIN"); // allowed: another owner remains
    await expect(changeUserRole(c.owner, hrUser.id, "HR_ADMIN")).rejects.toThrow(/at least one owner/); // the last remaining owner
  });
});

describe("Letterhead", () => {
  it("is tenant-scoped and permission-gated", async () => {
    const a = await makeWorld();
    const b = await makeWorld();
    await expect(updateLetterhead(a.owner, b.companyId, { letterheadColor: "#111111" })).rejects.toThrow(/not found/);
    await expect(updateLetterhead(a.employee, a.companyId, { letterheadColor: "#111111" })).rejects.toThrow();
    const c = await updateLetterhead(a.hr, a.companyId, { letterheadColor: "#5B3FD6", letterheadLayout: "CENTER", signatoryName: "Aisyah", signatoryTitle: "Head of People" });
    expect(c).toMatchObject({ letterheadColor: "#5B3FD6", letterheadLayout: "CENTER", signatoryName: "Aisyah" });
  });
});

describe("Owner data rights", () => {
  it("only the owner can export everything, and it's audited", async () => {
    const w = await makeWorld();
    await expect(exportWorkspace(w.hr)).rejects.toThrow(/Only the owner/);
    const dump = await exportWorkspace(w.owner);
    expect(dump.employees.length).toBe(2);
    expect(await prisma.auditLog.count({ where: { tenantId: w.tenantId, action: "EXPORT" } })).toBe(1);
  });

  it("closing requires the exact name and locks everyone out", async () => {
    const c = await customer("Tutup Kedai Sdn Bhd");
    await expect(closeWorkspace(c.owner, "tutup kedai")).rejects.toThrow(/exactly/);
    await closeWorkspace(c.owner, "Tutup Kedai Sdn Bhd");
    await expect(authenticate(c.email, PASSWORD)).rejects.toThrow(/closed/);
    // support can restore within the retention window
    expect(await reactivateWorkspace(operator, c.tenant.id)).toBe("TRIALING");
    await expect(authenticate(c.email, PASSWORD)).resolves.toBeTruthy();
  });
});

describe("Platform operator console", () => {
  it("non-operators are refused", async () => {
    const fake = { userId: "x", name: "x", platformAdmin: false };
    await expect(listWorkspaces(fake)).rejects.toThrow(/operators only/);
    await expect(suspendWorkspace(fake, "x", "because")).rejects.toThrow();
  });

  it("suspending signs the customer out; reactivating restores the right status", async () => {
    const c = await customer();
    await expect(suspendWorkspace(operator, c.tenant.id, "  ")).rejects.toThrow(/reason/);
    await suspendWorkspace(operator, c.tenant.id, "Chargeback");
    await expect(authenticate(c.email, PASSWORD)).rejects.toThrow(/suspended: Chargeback/);
    await expect(checkout(c.owner, { plan: "GROWTH", cycle: "MONTHLY", method: "FPX" })).rejects.toThrow(/can't be billed/);
    await expect(suspendWorkspace(operator, c.tenant.id, "again")).rejects.toThrow(/Already/);
    expect(await reactivateWorkspace(operator, c.tenant.id)).toBe("TRIALING");
    await expect(authenticate(c.email, PASSWORD)).resolves.toBeTruthy();
    const log = await prisma.auditLog.findMany({ where: { tenantId: c.tenant.id, userName: { startsWith: "Crewly Support" } } });
    expect(log.map((l) => l.summary).join(" ")).toMatch(/suspended[\s\S]*reactivated/);
  });

  it("operators can't suspend their own workspace", async () => {
    const own = await prisma.user.findUniqueOrThrow({ where: { id: operator.userId } });
    await expect(suspendWorkspace(operator, own.tenantId, "oops")).rejects.toThrow(/own operator workspace/);
  });

  it("extending a trial adds days from the later of now or the current end, and emails the owner", async () => {
    const c = await customer();
    const until = await extendTrial(operator, c.tenant.id, 7);
    expect(Math.round((until.getTime() - c.tenant.trialEndsAt!.getTime()) / 86400000)).toBe(7);
    await prisma.tenant.update({ where: { id: c.tenant.id }, data: { trialEndsAt: new Date(Date.now() - 10 * 86400000) } });
    const revived = await extendTrial(operator, c.tenant.id, 5);
    expect(Math.round((revived.getTime() - Date.now()) / 86400000)).toBe(5);
    await expect(extendTrial(operator, c.tenant.id, 0)).rejects.toThrow(/1 – 90/);
    expect(await prisma.outboundEmail.count({ where: { tenantId: c.tenant.id, kind: "TRIAL" } })).toBe(2);
  });

  it("only trials can be extended; support can comp a plan", async () => {
    const c = await customer();
    await setWorkspacePlan(operator, c.tenant.id, "ENTERPRISE", new Date(Date.now() + 30 * 86400000));
    const t = await prisma.tenant.findUniqueOrThrow({ where: { id: c.tenant.id } });
    expect(t).toMatchObject({ plan: "ENTERPRISE", subscriptionStatus: "ACTIVE" });
    await expect(extendTrial(operator, c.tenant.id, 7)).rejects.toThrow(/Only trials/);
  });

  it("metrics count trials, paying customers and MRR", async () => {
    const m = await platformMetrics(operator);
    expect(m.workspaces).toBeGreaterThan(5);
    expect(m.trialing).toBeGreaterThan(0);
    expect(m.paying).toBeGreaterThan(0);
    expect(m.mrr).toBeGreaterThan(0);
    const rows = await listWorkspaces(operator, "Tutup Kedai");
    expect(rows.every((r) => r.name.includes("Tutup Kedai"))).toBe(true);
  });
});
