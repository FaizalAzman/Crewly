import { prisma } from "@/lib/db";
import type { Ctx } from "../types";

/**
 * The set of employees whose requests the actor can see/approve.
 * Returns null for "everyone in the tenant" (HR-level roles).
 */
export async function approvalScope(ctx: Ctx): Promise<string[] | null> {
  if (ctx.role === "OWNER" || ctx.role === "HR_ADMIN" || ctx.role === "PAYROLL") return null;
  if (!ctx.employeeId) return [];
  const result: string[] = [];
  let frontier = [ctx.employeeId];
  for (let depth = 0; depth < 8 && frontier.length; depth++) {
    const reports = await prisma.employee.findMany({
      where: { tenantId: ctx.tenantId, managerId: { in: frontier } },
      select: { id: true },
    });
    frontier = reports.map((r) => r.id).filter((id) => !result.includes(id));
    result.push(...frontier);
  }
  return result;
}

/** Prisma `where` fragment restricting employeeId to the actor's approval scope (excluding self). */
export async function scopedEmployeeWhere(ctx: Ctx) {
  const scope = await approvalScope(ctx);
  const notSelf = ctx.employeeId ? { not: ctx.employeeId } : undefined;
  if (scope === null) return notSelf ? { employeeId: notSelf } : {};
  return { employeeId: { in: scope.filter((id) => id !== ctx.employeeId) } };
}
