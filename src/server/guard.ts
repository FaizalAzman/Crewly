import { can, type Permission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { ForbiddenError, type Ctx } from "./types";

export function assertCan(ctx: Ctx, permission: Permission) {
  if (!can(ctx.role, permission)) throw new ForbiddenError();
}

/** A manager may act on their direct (and indirect) reports; HR-level roles on anyone in the tenant. */
export async function isInManagerChain(managerEmployeeId: string, employeeId: string): Promise<boolean> {
  let current = await prisma.employee.findUnique({ where: { id: employeeId }, select: { managerId: true } });
  let hops = 0;
  while (current?.managerId && hops < 10) {
    if (current.managerId === managerEmployeeId) return true;
    current = await prisma.employee.findUnique({ where: { id: current.managerId }, select: { managerId: true } });
    hops++;
  }
  return false;
}

export async function assertCanApproveFor(ctx: Ctx, employeeId: string, permission: Permission) {
  if (ctx.employeeId && ctx.employeeId === employeeId) throw new ForbiddenError("You can't approve your own request.");
  if (ctx.role === "OWNER" || ctx.role === "HR_ADMIN") return;
  if (ctx.role === "PAYROLL" && can(ctx.role, permission)) return;
  if (ctx.role === "MANAGER" && can(ctx.role, permission) && ctx.employeeId && (await isInManagerChain(ctx.employeeId, employeeId))) return;
  throw new ForbiddenError("Only the employee's manager or HR can approve this.");
}

export async function audit(ctx: Ctx, action: string, entity: string, entityId: string | null, summary: string) {
  await prisma.auditLog.create({
    data: { tenantId: ctx.tenantId, userId: ctx.userId, userName: ctx.userName, action, entity, entityId, summary },
  });
}

export async function notifyEmployee(employeeId: string, title: string, body?: string, link?: string) {
  const user = await prisma.user.findUnique({ where: { employeeId } });
  if (!user) return;
  await prisma.notification.create({ data: { userId: user.id, title, body, link } });
}
