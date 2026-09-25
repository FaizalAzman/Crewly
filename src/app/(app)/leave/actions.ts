"use server";

import { act } from "@/server/action";
import { requireCtx } from "@/server/context";
import { adjustBalance, carryForward, creditReplacementLeave, initLeaveBalances } from "@/server/services/leave.service";
import { prisma } from "@/lib/db";
import { assertCan, audit } from "@/server/guard";
import { DomainError, type ActionState } from "@/server/types";
import { boolField, numField, optStr, str } from "@/lib/utils";

export async function carryForwardAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("leave.manage");
  return act(async () => {
    const n = await carryForward(ctx, numField(fd, "year"));
    return `Carried forward ${n} balance(s) into ${numField(fd, "year") + 1}`;
  }, ["/leave"]);
}

export async function creditRlAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("leave.manage");
  return act(async () => {
    await creditReplacementLeave(ctx, str(fd, "employeeId"), numField(fd, "days"), str(fd, "reason"));
    return "Replacement leave credited";
  }, ["/leave"]);
}

export async function adjustBalanceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("leave.manage");
  return act(async () => {
    const emp = str(fd, "employeeId");
    const type = str(fd, "leaveTypeId");
    const year = numField(fd, "year", new Date().getFullYear());
    let bal = await prisma.leaveBalance.findUnique({ where: { employeeId_leaveTypeId_year: { employeeId: emp, leaveTypeId: type, year } } });
    if (!bal) {
      await initLeaveBalances(ctx.tenantId, emp, year);
      bal = await prisma.leaveBalance.findUniqueOrThrow({ where: { employeeId_leaveTypeId_year: { employeeId: emp, leaveTypeId: type, year } } });
    }
    await adjustBalance(ctx, bal.id, numField(fd, "delta"), str(fd, "reason"));
    return "Balance adjusted";
  }, ["/leave"]);
}

export async function recalcEntitlementsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("leave.manage");
  return act(async () => {
    const year = numField(fd, "year", new Date().getFullYear());
    const emps = await prisma.employee.findMany({ where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROBATION", "NOTICE"] } } });
    for (const e of emps) await initLeaveBalances(ctx.tenantId, e.id, year);
    await audit(ctx, "UPDATE", "LeaveBalance", null, `Recalculated ${year} entitlements for ${emps.length} employees`);
    return `Entitlements recalculated for ${emps.length} employees`;
  }, ["/leave"]);
}

export async function saveLeaveTypeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("leave.manage");
  return act(async () => {
    assertCan(ctx, "leave.manage");
    const id = optStr(fd, "id");
    const data = {
      code: str(fd, "code").toUpperCase(),
      name: str(fd, "name"),
      emoji: str(fd, "emoji") || "🌴",
      color: str(fd, "color") || "#C6F432",
      paid: boolField(fd, "paid"),
      entitlementRule: str(fd, "entitlementRule") || "FIXED",
      defaultDays: numField(fd, "defaultDays"),
      carryForwardMax: numField(fd, "carryForwardMax"),
      requiresAttachment: boolField(fd, "requiresAttachment"),
      allowHalfDay: boolField(fd, "allowHalfDay"),
      countsWorkingDaysOnly: boolField(fd, "countsWorkingDaysOnly"),
      minNoticeDays: numField(fd, "minNoticeDays"),
      gender: optStr(fd, "gender"),
      active: boolField(fd, "active"),
    };
    if (!data.code || !data.name) throw new DomainError("Code and name are required.");
    if (id) {
      const existing = await prisma.leaveType.findFirst({ where: { id, tenantId: ctx.tenantId } });
      if (!existing) throw new DomainError("Leave type not found.");
      if (existing.statutory && data.defaultDays < existing.defaultDays && existing.entitlementRule === "FIXED") {
        throw new DomainError(`${existing.name} is a statutory minimum (${existing.defaultDays} days) and can't be reduced.`);
      }
      await prisma.leaveType.update({ where: { id }, data: { ...data, code: existing.code } });
    } else {
      if (await prisma.leaveType.findFirst({ where: { tenantId: ctx.tenantId, code: data.code } })) throw new DomainError("That code is already used.");
      await prisma.leaveType.create({ data: { ...data, tenantId: ctx.tenantId } });
    }
    return "Leave type saved";
  }, ["/leave"]);
}
