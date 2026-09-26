import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session-token";
import { can, type Permission } from "@/lib/permissions";
import type { Ctx } from "./types";
import { ctxFromUser } from "./ctx";
import { tenantAccess } from "./services/subscription.service";
import { countPendingApprovals } from "./services/approvals.service";
import { APPROVAL_PERMISSIONS } from "@/components/shell/nav";

export const getSessionUser = cache(async () => {
  const store = await cookies();
  const payload = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!payload) return null;
  const user = await prisma.user.findUnique({
    where: { id: payload.uid },
    include: { tenant: true, customRole: true, employee: { select: { id: true, fullName: true, avatarColor: true, jobTitle: true } } },
  });
  if (!user || !user.active || user.tenantId !== payload.tid) return null;
  // Suspended or closed workspaces lose access immediately (operators keep theirs).
  if (!tenantAccess(user.tenant).canLogin && !user.platformAdmin) return null;
  return user;
});

export const getCtx = cache(async (): Promise<Ctx | null> => {
  const user = await getSessionUser();
  return user ? ctxFromUser(user) : null;
});

/** Pending-approval count for the sidebar badge and dashboard, memoised so one request computes it once. */
export const getPendingApprovalCount = cache(async (): Promise<number> => {
  const ctx = await getCtx();
  if (!ctx || !APPROVAL_PERMISSIONS.some((p) => can(ctx, p))) return 0;
  return countPendingApprovals(ctx);
});

/** For pages & actions: redirects to /login when signed out, and to /me when the role lacks the permission. */
export async function requireCtx(permission?: Permission): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) redirect("/login");
  if (permission && !can(ctx, permission)) redirect("/me?denied=1");
  return ctx;
}
