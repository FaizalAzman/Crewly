import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import type { Ctx } from "../types";
import { scopedEmployeeWhere } from "./scope";

export async function countPendingApprovals(ctx: Ctx): Promise<number> {
  const scope = await scopedEmployeeWhere(ctx);
  const base = { tenantId: ctx.tenantId, status: "PENDING", ...scope };
  const [leave, claims, ot, loans, comp] = await Promise.all([
    can(ctx.role, "leave.approve") ? prisma.leaveRequest.count({ where: base }) : 0,
    can(ctx.role, "claims.approve") ? prisma.claim.count({ where: base }) : 0,
    can(ctx.role, "overtime.approve") ? prisma.overtimeRequest.count({ where: base }) : 0,
    can(ctx.role, "loans.manage") ? prisma.loan.count({ where: base }) : 0,
    can(ctx.role, "compensation.manage") ? prisma.compensationChange.count({ where: base }) : 0,
  ]);
  return leave + claims + ot + loans + comp;
}

export async function listPendingApprovals(ctx: Ctx) {
  const scope = await scopedEmployeeWhere(ctx);
  const base = { tenantId: ctx.tenantId, status: "PENDING", ...scope };
  const emp = { select: { id: true, fullName: true, avatarColor: true, jobTitle: true, department: { select: { name: true } } } };
  const [leave, claims, overtime, loans, compensation] = await Promise.all([
    can(ctx.role, "leave.approve")
      ? prisma.leaveRequest.findMany({ where: base, include: { employee: emp, leaveType: true }, orderBy: { createdAt: "asc" } })
      : [],
    can(ctx.role, "claims.approve")
      ? prisma.claim.findMany({ where: base, include: { employee: emp, claimType: true }, orderBy: { createdAt: "asc" } })
      : [],
    can(ctx.role, "overtime.approve")
      ? prisma.overtimeRequest.findMany({ where: base, include: { employee: emp }, orderBy: { createdAt: "asc" } })
      : [],
    can(ctx.role, "loans.manage") ? prisma.loan.findMany({ where: base, include: { employee: emp }, orderBy: { createdAt: "asc" } }) : [],
    can(ctx.role, "compensation.manage")
      ? prisma.compensationChange.findMany({ where: base, include: { employee: emp }, orderBy: { createdAt: "asc" } })
      : [],
  ]);
  return { leave, claims, overtime, loans, compensation };
}
