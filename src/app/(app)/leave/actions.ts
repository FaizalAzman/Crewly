"use server";

import { act } from "@/server/action";
import { requireCtx } from "@/server/context";
import { adjustBalance, carryForward, creditReplacementLeave, initLeaveBalances } from "@/server/services/leave.service";
import { prisma } from "@/lib/db";
import { assertActOnEmployee, assertCan, audit } from "@/server/guard";
import { DomainError, type ActionState } from "@/server/types";
import { boolField, numField, optStr, str } from "@/lib/utils";

export async function carryForwardAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("leave.manage");
  return act(async () => {
    const year = numField(fd, "year");
    if (!Number.isInteger(year) || year < 2000 || year > new Date().getFullYear()) throw new DomainError("Pick a year that has ended or is ending.");
    const n = await carryForward(ctx, year);
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
    // Validate ownership before touching balances (initLeaveBalances would otherwise create rows for any id).
    await assertActOnEmployee(ctx, emp, "leave.manage");
    if (!(await prisma.leaveType.findFirst({ where: { id: type, tenantId: ctx.tenantId } }))) throw new DomainError("Leave type not found.");
    const thisYear = new Date().getFullYear();
    if (!Number.isInteger(year) || year < thisYear - 1 || year > thisYear + 1) throw new DomainError("Only last, this or next year's balances can be adjusted.");
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
    const thisYear = new Date().getFullYear();
    if (!Number.isInteger(year) || year < thisYear - 1 || year > thisYear + 1) throw new DomainError("Pick last, this or next year.");
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
    if (!/^[A-Z0-9_]{1,10}$/.test(data.code)) throw new DomainError("Code must be up to 10 letters, digits or underscores.");
    if (!["EA_ANNUAL", "EA_SICK", "FIXED", "NONE"].includes(data.entitlementRule)) throw new DomainError("Unknown entitlement rule.");
    if (data.gender && !["MALE", "FEMALE"].includes(data.gender)) throw new DomainError("Gender restriction must be male or female.");
    if (data.defaultDays < 0 || data.defaultDays > 365) throw new DomainError("Default days must be 0 – 365.");
    if (data.carryForwardMax < 0 || data.carryForwardMax > 365) throw new DomainError("Carry-forward must be 0 – 365 days.");
    if (!Number.isInteger(data.minNoticeDays) || data.minNoticeDays < 0 || data.minNoticeDays > 180) throw new DomainError("Notice must be 0 – 180 days.");
    if (id) {
      const existing = await prisma.leaveType.findFirst({ where: { id, tenantId: ctx.tenantId } });
      if (!existing) throw new DomainError("Leave type not found.");
      if (existing.statutory && (data.entitlementRule !== existing.entitlementRule || !data.active || data.gender !== existing.gender || !data.paid)) {
        throw new DomainError(`${existing.name} is required by the Employment Act 1955: it must stay active and paid, with its statutory entitlement rule.`);
      }
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
