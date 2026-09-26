import { prisma } from "@/lib/db";
import { round2 } from "@/lib/utils";
import { assertCan, audit } from "../guard";
import { DomainError, ForbiddenError, type Ctx } from "../types";
import { sendMail } from "./mail.service";

export const PLANS = {
  STARTER: { name: "Starter", price: 6, maxEmployees: 25, multiEntity: false },
  GROWTH: { name: "Growth", price: 12, maxEmployees: Infinity, multiEntity: false },
  ENTERPRISE: { name: "Enterprise", price: 18, maxEmployees: Infinity, multiEntity: true },
} as const;
export type PlanKey = keyof typeof PLANS;
export const MIN_SEATS = 10;
export const TRIAL_DAYS = 14;

export type AccessState = "TRIAL" | "TRIAL_ENDED" | "ACTIVE" | "PAST_DUE" | "CANCELLED_GRACE" | "CANCELLED" | "SUSPENDED" | "CLOSED";

interface TenantLike {
  subscriptionStatus: string;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  closedAt?: Date | null;
  suspendedReason?: string | null;
}

/**
 * Pure access rule for a workspace (unit tested):
 *  - trial: full access until trialEndsAt, then read-only until they subscribe
 *  - active: full access; past the period end without renewal → past due (read-only)
 *  - cancelled: full access until the paid period ends, then read-only
 *  - suspended / closed: no access (enforced at login and session lookup)
 */
export function tenantAccess(t: TenantLike, now: Date = new Date()): { state: AccessState; writable: boolean; canLogin: boolean; daysLeft: number | null; message: string } {
  const days = (d: Date | null) => (d ? Math.ceil((d.getTime() - now.getTime()) / 86400000) : null);
  if (t.closedAt) return { state: "CLOSED", writable: false, canLogin: false, daysLeft: null, message: "This workspace has been closed." };
  if (t.subscriptionStatus === "SUSPENDED") return { state: "SUSPENDED", writable: false, canLogin: false, daysLeft: null, message: `This workspace is suspended${t.suspendedReason ? `: ${t.suspendedReason}` : ""}. Contact support@crewly.my.` };
  if (t.subscriptionStatus === "TRIALING") {
    const left = days(t.trialEndsAt);
    if (left === null || left > 0) return { state: "TRIAL", writable: true, canLogin: true, daysLeft: left, message: left === null ? "Free trial" : `${left} day${left === 1 ? "" : "s"} left in your free trial` };
    return { state: "TRIAL_ENDED", writable: false, canLogin: true, daysLeft: 0, message: "Your free trial has ended. The workspace is read-only until you subscribe." };
  }
  if (t.subscriptionStatus === "ACTIVE") {
    const left = days(t.currentPeriodEnd);
    if (left === null || left >= 0) return { state: "ACTIVE", writable: true, canLogin: true, daysLeft: left, message: "Subscription active" };
    return { state: "PAST_DUE", writable: false, canLogin: true, daysLeft: left, message: "Your subscription payment is overdue. The workspace is read-only until it's renewed." };
  }
  if (t.subscriptionStatus === "PAST_DUE") return { state: "PAST_DUE", writable: false, canLogin: true, daysLeft: 0, message: "Your subscription payment is overdue. The workspace is read-only until it's renewed." };
  if (t.subscriptionStatus === "CANCELLED") {
    const left = days(t.currentPeriodEnd);
    if (left !== null && left >= 0) return { state: "CANCELLED_GRACE", writable: true, canLogin: true, daysLeft: left, message: `Subscription cancelled. Full access for ${left} more day(s).` };
    return { state: "CANCELLED", writable: false, canLogin: true, daysLeft: 0, message: "Your subscription has ended. The workspace is read-only. Resubscribe to continue." };
  }
  return { state: "ACTIVE", writable: true, canLogin: true, daysLeft: null, message: "" };
}

export async function assertTenantWritable(tenantId: string, now = new Date()) {
  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const a = tenantAccess(t, now);
  if (!a.writable) throw new DomainError(a.message);
}

export async function activeHeadcount(tenantId: string) {
  return prisma.employee.count({ where: { tenantId, status: { in: ["ACTIVE", "PROBATION", "NOTICE"] } } });
}

/** Plan limits when adding employees (Starter caps at 25 active employees). */
export async function assertCanAddEmployees(tenantId: string, adding = 1) {
  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const plan = PLANS[t.plan as PlanKey] ?? PLANS.GROWTH;
  if (plan.maxEmployees === Infinity) return;
  const current = await activeHeadcount(tenantId);
  if (current + adding > plan.maxEmployees) throw new DomainError(`The ${plan.name} plan covers up to ${plan.maxEmployees} active employees (you have ${current}). Upgrade to Growth to add more.`);
}

export function quoteFor(plan: PlanKey, headcount: number, cycle: "MONTHLY" | "YEARLY") {
  const p = PLANS[plan];
  const seats = Math.max(MIN_SEATS, headcount);
  const monthly = seats * p.price;
  const subtotal = cycle === "YEARLY" ? monthly * 10 : monthly; // 2 months free yearly
  const sst = round2(subtotal * 0.08);
  return { plan, cycle, seats, price: p.price, subtotal: round2(subtotal), sst, total: round2(subtotal + sst) };
}

export async function assertPlanFits(tenantId: string, plan: PlanKey) {
  const [headcount, entities] = await Promise.all([activeHeadcount(tenantId), prisma.company.count({ where: { tenantId } })]);
  const p = PLANS[plan];
  if (headcount > p.maxEmployees) throw new DomainError(`${p.name} supports up to ${p.maxEmployees} employees; you have ${headcount}.`);
  if (!p.multiEntity && entities > 1) throw new DomainError(`You have ${entities} legal entities. Multiple entities need the Enterprise plan.`);
}

// ───────────── Payment gateway adapter ─────────────

export interface PaymentRequest {
  amount: number;
  currency: "MYR";
  description: string;
  method: "FPX" | "CARD";
  /** Sandbox only: bank code or card number used to simulate outcomes. */
  instrument?: string;
}
export interface PaymentResult {
  ok: boolean;
  reference: string;
  message?: string;
}
export interface PaymentGateway {
  charge(req: PaymentRequest): Promise<PaymentResult>;
}

/** Sandbox gateway: approves everything except the documented decline card 4000 0000 0000 0002. */
export const sandboxGateway: PaymentGateway = {
  async charge(req) {
    const digits = (req.instrument ?? "").replace(/\D/g, "");
    if (req.method === "CARD" && digits === "4000000000000002") return { ok: false, reference: "", message: "Card declined (sandbox test card)." };
    if (req.amount <= 0) return { ok: false, reference: "", message: "Invalid amount." };
    return { ok: true, reference: `SBX-${Date.now().toString(36).toUpperCase()}` };
  },
};

/** Real gateways (Billplz, Stripe, iPay88…) implement PaymentGateway and are selected here. */
export function gateway(): PaymentGateway {
  return sandboxGateway;
}

/** Subscribe / renew / switch plan: charges the gateway, records the invoice, activates the subscription. */
export async function checkout(ctx: Ctx, input: { plan: PlanKey; cycle: "MONTHLY" | "YEARLY"; method: "FPX" | "CARD"; instrument?: string }, gw: PaymentGateway = gateway(), now = new Date()) {
  assertCan(ctx, "billing.manage");
  if (!PLANS[input.plan]) throw new DomainError("Unknown plan.");
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } });
  if (tenant.subscriptionStatus === "SUSPENDED" || tenant.closedAt) throw new ForbiddenError("This workspace can't be billed. Contact support.");
  if (!["MONTHLY", "YEARLY"].includes(input.cycle)) throw new DomainError("Pick monthly or yearly billing.");
  if (!["FPX", "CARD"].includes(input.method)) throw new DomainError("Pick a payment method.");
  await assertPlanFits(ctx.tenantId, input.plan);
  // Double-submit guard: a second checkout right after a successful one is almost certainly a repeated click.
  const recent = await prisma.invoice.findFirst({
    where: { tenantId: ctx.tenantId, status: "PAID", plan: input.plan, cycle: input.cycle, paidAt: { gte: new Date(now.getTime() - 2 * 60_000), lte: now } },
  });
  if (recent) throw new DomainError(`Payment ${recent.number} went through a moment ago, so we didn't charge you again.`);
  const q = quoteFor(input.plan, await activeHeadcount(ctx.tenantId), input.cycle);
  const res = await gw.charge({ amount: q.total, currency: "MYR", description: `Crewly ${PLANS[input.plan].name} (${input.cycle.toLowerCase()})`, method: input.method, instrument: input.instrument });
  if (!res.ok) throw new DomainError(res.message ?? "Payment failed. Try another method.");

  // A new period starts now, or at the end of the current paid period if still active.
  const base = tenant.subscriptionStatus === "ACTIVE" && tenant.currentPeriodEnd && tenant.currentPeriodEnd > now ? tenant.currentPeriodEnd : now;
  const end = new Date(base);
  if (input.cycle === "YEARLY") end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  const count = await prisma.invoice.count({ where: { tenantId: ctx.tenantId } });
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const invoice = await prisma.invoice.create({
    data: {
      tenantId: ctx.tenantId,
      number: `INV-${now.getUTCFullYear()}-${tenant.slug.slice(0, 6).toUpperCase()}-${String(count + 1).padStart(4, "0")}`,
      period,
      seats: q.seats,
      amount: q.subtotal,
      sst: q.sst,
      status: "PAID",
      plan: input.plan,
      cycle: input.cycle,
      paymentRef: res.reference,
      paidAt: now,
      issuedAt: now,
    },
  });
  await prisma.tenant.update({ where: { id: ctx.tenantId }, data: { plan: input.plan, billingCycle: input.cycle, subscriptionStatus: "ACTIVE", currentPeriodEnd: end, seats: q.seats } });
  const owner = await prisma.user.findFirst({ where: { tenantId: ctx.tenantId, role: "OWNER", active: true } });
  if (owner) {
    await sendMail({
      tenantId: ctx.tenantId,
      to: owner.email,
      kind: "BILLING",
      subject: `Receipt ${invoice.number}: RM${q.total.toFixed(2)}`,
      body: `Thanks! We received RM${q.total.toFixed(2)} for Crewly ${PLANS[input.plan].name} (${q.seats} seats, ${input.cycle.toLowerCase()}). Your subscription runs until ${end.toISOString().slice(0, 10)}.`,
    });
  }
  await audit(ctx, "UPDATE", "Subscription", ctx.tenantId, `Paid ${invoice.number} RM${q.total} · ${input.plan} ${input.cycle.toLowerCase()} until ${end.toISOString().slice(0, 10)}`);
  return { invoice, periodEnd: end, quote: q };
}

export async function cancelSubscription(ctx: Ctx) {
  assertCan(ctx, "billing.manage");
  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } });
  if (t.subscriptionStatus !== "ACTIVE") throw new DomainError("There's no active subscription to cancel.");
  await prisma.tenant.update({ where: { id: ctx.tenantId }, data: { subscriptionStatus: "CANCELLED" } });
  await audit(ctx, "UPDATE", "Subscription", ctx.tenantId, `Cancelled subscription (access until ${t.currentPeriodEnd?.toISOString().slice(0, 10) ?? "now"})`);
}
