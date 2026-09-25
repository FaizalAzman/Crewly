import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session-token";
import type { Role } from "@/lib/constants";
import { can, type Permission } from "@/lib/permissions";
import type { Ctx } from "./types";

export const getSessionUser = cache(async () => {
  const store = await cookies();
  const payload = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!payload) return null;
  const user = await prisma.user.findUnique({
    where: { id: payload.uid },
    include: { tenant: true, employee: { select: { id: true, fullName: true, avatarColor: true, jobTitle: true } } },
  });
  if (!user || !user.active || user.tenantId !== payload.tid) return null;
  return user;
});

export async function getCtx(): Promise<Ctx | null> {
  const user = await getSessionUser();
  if (!user) return null;
  return { tenantId: user.tenantId, userId: user.id, userName: user.name, role: user.role as Role, employeeId: user.employeeId };
}

/** For pages & actions: redirects to /login when signed out, and to /me when the role lacks the permission. */
export async function requireCtx(permission?: Permission): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) redirect("/login");
  if (permission && !can(ctx.role, permission)) redirect("/me?denied=1");
  return ctx;
}
