import { prisma } from "@/lib/db";
import { DomainError, ForbiddenError } from "../types";
import { PLANS, activeHeadcount, tenantAccess, type PlanKey } from "./subscription.service";
import { sendMail } from "./mail.service";

/** A Crewly operator acting across workspaces. */
export interface PlatformActor {
  userId: string;
  name: string;
  platformAdmin: boolean;
}

export function assertPlatformAdmin(actor: PlatformActor | null | undefined): asserts actor is PlatformActor {
  if (!actor?.platformAdmin) throw new ForbiddenError("Platform console is for Crewly operators only.");
}

async function log(actor: PlatformActor, tenantId: string, summary: string) {
  await prisma.auditLog.create({ data: { tenantId, userId: null, userName: `Crewly Support (${actor.name})`, action: "UPDATE", entity: "Tenant", entityId: tenantId, summary } });
}

/** Monthly recurring revenue for a tenant (yearly plans spread over 12 months). */
export function monthlyRevenue(t: { plan: string; billingCycle: string; subscriptionStatus: string; seats: number }, headcount: number) {
  if (!["ACTIVE", "CANCELLED"].includes(t.subscriptionStatus)) return 0;
  const p = PLANS[t.plan as PlanKey] ?? PLANS.GROWTH;
  const seats = Math.max(10, headcount);
  return Math.round((t.billingCycle === "YEARLY" ? (seats * p.price * 10) / 12 : seats * p.price) * 100) / 100;
}

export async function listWorkspaces(actor: PlatformActor, q?: string) {
  assertPlatformAdmin(actor);
  const tenants = await prisma.tenant.findMany({
    where: q ? { OR: [{ name: { contains: q } }, { slug: { contains: q } }] } : {},
    include: { _count: { select: { users: true, companies: true } } },
    orderBy: { createdAt: "desc" },
  });
  const rows = [];
  for (const t of tenants) {
    const headcount = await activeHeadcount(t.id);
    const owner = await prisma.user.findFirst({ where: { tenantId: t.id, role: "OWNER" }, orderBy: { createdAt: "asc" } });
    const lastLogin = await prisma.user.findFirst({ where: { tenantId: t.id, lastLoginAt: { not: null } }, orderBy: { lastLoginAt: "desc" } });
    rows.push({ ...t, headcount, owner, lastLoginAt: lastLogin?.lastLoginAt ?? null, access: tenantAccess(t), mrr: monthlyRevenue(t, headcount) });
  }
  return rows;
}

export async function platformMetrics(actor: PlatformActor) {
  const rows = await listWorkspaces(actor);
  const since = new Date(Date.now() - 30 * 86400000);
  return {
    workspaces: rows.length,
    trialing: rows.filter((r) => r.access.state === "TRIAL").length,
    paying: rows.filter((r) => ["ACTIVE", "CANCELLED_GRACE"].includes(r.access.state)).length,
    atRisk: rows.filter((r) => ["TRIAL_ENDED", "PAST_DUE", "CANCELLED"].includes(r.access.state)).length,
    suspended: rows.filter((r) => r.access.state === "SUSPENDED").length,
    mrr: Math.round(rows.reduce((s, r) => s + r.mrr, 0) * 100) / 100,
    employees: rows.reduce((s, r) => s + r.headcount, 0),
    signups30d: rows.filter((r) => r.createdAt >= since).length,
  };
}

export async function extendTrial(actor: PlatformActor, tenantId: string, days: number) {
  assertPlatformAdmin(actor);
  if (days < 1 || days > 90) throw new DomainError("Extend by 1 – 90 days.");
  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  if (t.subscriptionStatus !== "TRIALING") throw new DomainError("Only trials can be extended.");
  const base = t.trialEndsAt && t.trialEndsAt > new Date() ? t.trialEndsAt : new Date();
  const until = new Date(base.getTime() + days * 86400000);
  await prisma.tenant.update({ where: { id: tenantId }, data: { trialEndsAt: until } });
  await log(actor, tenantId, `Trial extended by ${days} days to ${until.toISOString().slice(0, 10)}`);
  const owner = await prisma.user.findFirst({ where: { tenantId, role: "OWNER" } });
  if (owner) await sendMail({ tenantId, to: owner.email, kind: "TRIAL", subject: "Your Crewly trial has been extended", body: `Good news: your trial now runs until ${until.toISOString().slice(0, 10)}.` });
  return until;
}

export async function suspendWorkspace(actor: PlatformActor, tenantId: string, reason: string) {
  assertPlatformAdmin(actor);
  if (!reason.trim()) throw new DomainError("Give a reason for the suspension.");
  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const self = await prisma.user.findUnique({ where: { id: actor.userId } });
  if (self?.tenantId === tenantId) throw new DomainError("You can't suspend your own operator workspace.");
  if (t.subscriptionStatus === "SUSPENDED") throw new DomainError("Already suspended.");
  await prisma.tenant.update({ where: { id: tenantId }, data: { subscriptionStatus: "SUSPENDED", suspendedReason: reason } });
  await log(actor, tenantId, `Workspace suspended: ${reason}`);
}

export async function reactivateWorkspace(actor: PlatformActor, tenantId: string) {
  assertPlatformAdmin(actor);
  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  if (t.subscriptionStatus !== "SUSPENDED" && !t.closedAt) throw new DomainError("Workspace isn't suspended or closed.");
  const status = t.currentPeriodEnd && t.currentPeriodEnd > new Date() ? "ACTIVE" : t.trialEndsAt && t.trialEndsAt > new Date() ? "TRIALING" : "PAST_DUE";
  await prisma.tenant.update({ where: { id: tenantId }, data: { subscriptionStatus: status, suspendedReason: null, closedAt: null } });
  await log(actor, tenantId, `Workspace reactivated (${status.toLowerCase()})`);
  return status;
}

/** Comp / manual plan change by support (e.g. invoiced offline). */
export async function setWorkspacePlan(actor: PlatformActor, tenantId: string, plan: PlanKey, activeUntil: Date | null) {
  assertPlatformAdmin(actor);
  if (!PLANS[plan]) throw new DomainError("Unknown plan.");
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { plan, ...(activeUntil ? { subscriptionStatus: "ACTIVE", currentPeriodEnd: activeUntil } : {}) },
  });
  await log(actor, tenantId, `Plan set to ${plan}${activeUntil ? `, active until ${activeUntil.toISOString().slice(0, 10)}` : ""}`);
}
