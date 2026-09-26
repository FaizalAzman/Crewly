import { prisma } from "@/lib/db";
import { assertCan, audit } from "../guard";
import { DomainError, ForbiddenError, type Ctx } from "../types";
import { assertNoEscalation, resolveRoleKey } from "./roles.service";
import { hashPassword, verifyPassword } from "./auth.service";

export interface WorkspaceSettings {
  name: string;
  workDaysPerWeek: number;
  restDay: number;
  offDay: number | null;
  payrollCutoff: number;
  payDay: number;
  unpaidLeaveBasis: string;
  mileageRate: number;
  lateGraceMinutes: number;
}

export function validateWorkspaceSettings(s: WorkspaceSettings) {
  if (!s.name.trim()) throw new DomainError("Workspace name is required.");
  if (![5, 5.5, 6].includes(s.workDaysPerWeek)) throw new DomainError("Work week must be 5, 5.5 or 6 days.");
  if (s.restDay < 0 || s.restDay > 6) throw new DomainError("Invalid rest day.");
  if (s.offDay !== null && s.offDay === s.restDay) throw new DomainError("Off day and rest day must differ.");
  if (s.workDaysPerWeek === 6 && s.offDay !== null) throw new DomainError("A 6-day week has no off day.");
  if (s.payrollCutoff < 1 || s.payrollCutoff > 31 || s.payDay < 1 || s.payDay > 31) throw new DomainError("Days must be between 1 and 31.");
  // EA s.19: wages must be paid within 7 days after the end of the wage period.
  if (s.payDay > 28 && s.payDay !== 31) throw new DomainError("Pay day should be on or before the 28th (or last day) to satisfy EA s.19 across all months.");
  if (!["WORKING_DAYS", "CALENDAR_DAYS", "FIXED_26"].includes(s.unpaidLeaveBasis)) throw new DomainError("Invalid unpaid-leave basis.");
  if (s.mileageRate < 0 || s.mileageRate > 5) throw new DomainError("Mileage rate looks off (RM0 – RM5 per km).");
  if (s.lateGraceMinutes < 0 || s.lateGraceMinutes > 60) throw new DomainError("Grace period must be 0 – 60 minutes.");
}

export async function updateWorkspace(ctx: Ctx, s: WorkspaceSettings) {
  assertCan(ctx, "settings.manage");
  validateWorkspaceSettings(s);
  await prisma.tenant.update({ where: { id: ctx.tenantId }, data: { ...s, offDay: s.workDaysPerWeek === 6 ? null : s.offDay } });
  await audit(ctx, "UPDATE", "Tenant", ctx.tenantId, "Updated workspace settings");
}

/** roleKey: a built-in role ("MANAGER") or a custom role ("CUSTOM:<id>"). */
export async function changeUserRole(ctx: Ctx, userId: string, roleKey: string) {
  assertCan(ctx, "settings.manage");
  const target = await resolveRoleKey(ctx, roleKey);
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId: ctx.tenantId } });
  if (!user) throw new DomainError("User not found.");
  if (user.id === ctx.userId) throw new DomainError("You can't change your own role.");
  if ((target.role === "OWNER" || user.role === "OWNER") && ctx.role !== "OWNER") throw new ForbiddenError("Only an owner can grant or remove the owner role.");
  assertNoEscalation(ctx, target.permissions);
  if (user.role === "OWNER" && target.role !== "OWNER") {
    const owners = await prisma.user.count({ where: { tenantId: ctx.tenantId, role: "OWNER", active: true } });
    if (owners <= 1) throw new DomainError("A workspace needs at least one owner.");
  }
  await prisma.user.update({ where: { id: userId }, data: { role: target.role, customRoleId: target.customRoleId } });
  await audit(ctx, "UPDATE", "User", userId, `Changed ${user.name}'s role to ${target.label}`);
}

/** Invite a user who isn't an employee (e.g. external accountant, auditor, consultant). */
export async function inviteUser(ctx: Ctx, input: { name: string; email: string; roleKey: string; password: string }) {
  assertCan(ctx, "settings.manage");
  const target = await resolveRoleKey(ctx, input.roleKey);
  if (target.role === "OWNER" && ctx.role !== "OWNER") throw new ForbiddenError("Only an owner can invite another owner.");
  assertNoEscalation(ctx, target.permissions);
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new DomainError("That email looks off.");
  if (input.name.trim().length < 2) throw new DomainError("Name is required.");
  if (input.password.length < 8) throw new DomainError("Temporary password must be at least 8 characters.");
  if (await prisma.user.findUnique({ where: { email } })) throw new DomainError("A user with this email already exists.");
  const employee = await prisma.employee.findFirst({ where: { tenantId: ctx.tenantId, email, user: null } });
  const user = await prisma.user.create({
    data: { tenantId: ctx.tenantId, email, name: input.name.trim(), role: target.role, customRoleId: target.customRoleId, employeeId: employee?.id ?? null, passwordHash: await hashPassword(input.password) },
  });
  await audit(ctx, "CREATE", "User", user.id, `Invited ${user.name} as ${target.label}`);
  return user;
}

/** Admin password reset. */
export async function resetUserPassword(ctx: Ctx, userId: string, password: string) {
  assertCan(ctx, "settings.manage");
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId: ctx.tenantId } });
  if (!user) throw new DomainError("User not found.");
  if (user.role === "OWNER" && ctx.role !== "OWNER") throw new ForbiddenError("Only an owner can reset an owner's password.");
  if (password.length < 8) throw new DomainError("Password must be at least 8 characters.");
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password) } });
  await audit(ctx, "UPDATE", "User", userId, `Reset password for ${user.name}`);
}

/** Self-service password change. */
export async function changeOwnPassword(ctx: Ctx, current: string, next: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
  if (!(await verifyPassword(current, user.passwordHash))) throw new DomainError("Your current password is incorrect.");
  if (next.length < 8) throw new DomainError("New password must be at least 8 characters.");
  if (next === current) throw new DomainError("Choose a different password.");
  await prisma.user.update({ where: { id: ctx.userId }, data: { passwordHash: await hashPassword(next) } });
  await audit(ctx, "UPDATE", "User", ctx.userId, "Changed own password");
}

export async function setUserActive(ctx: Ctx, userId: string, active: boolean) {
  assertCan(ctx, "settings.manage");
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId: ctx.tenantId } });
  if (!user) throw new DomainError("User not found.");
  if (user.id === ctx.userId) throw new DomainError("You can't deactivate yourself.");
  if (user.role === "OWNER" && !active) {
    const owners = await prisma.user.count({ where: { tenantId: ctx.tenantId, role: "OWNER", active: true } });
    if (owners <= 1) throw new DomainError("Can't deactivate the last owner.");
    if (ctx.role !== "OWNER") throw new ForbiddenError("Only an owner can deactivate another owner.");
  }
  await prisma.user.update({ where: { id: userId }, data: { active } });
  await audit(ctx, "UPDATE", "User", userId, `${active ? "Reactivated" : "Deactivated"} ${user.name}`);
}

export const PLAN_PRICES: Record<string, number> = { STARTER: 6, GROWTH: 12, ENTERPRISE: 18 };

/** Monthly bill: seats × price, minimum 10 seats, +8% SST; yearly = 10 months. */
export function quote(plan: string, seats: number, cycle: "MONTHLY" | "YEARLY") {
  const price = PLAN_PRICES[plan] ?? 12;
  const billable = Math.max(10, seats);
  const monthly = billable * price;
  const subtotal = cycle === "YEARLY" ? monthly * 10 : monthly;
  const sst = Math.round(subtotal * 0.08 * 100) / 100;
  return { price, billable, subtotal, sst, total: Math.round((subtotal + sst) * 100) / 100 };
}

export async function changePlan(ctx: Ctx, plan: string, cycle: "MONTHLY" | "YEARLY") {
  assertCan(ctx, "billing.manage");
  if (!PLAN_PRICES[plan]) throw new DomainError("Unknown plan.");
  const active = await prisma.employee.count({ where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROBATION", "NOTICE"] } } });
  if (plan === "STARTER" && active > 25) throw new DomainError(`Starter supports up to 25 employees; you have ${active}.`);
  const multi = await prisma.company.count({ where: { tenantId: ctx.tenantId } });
  if (plan !== "ENTERPRISE" && multi > 1) throw new DomainError("Multiple legal entities require the Enterprise plan.");
  await prisma.tenant.update({ where: { id: ctx.tenantId }, data: { plan, billingCycle: cycle } });
  await audit(ctx, "UPDATE", "Tenant", ctx.tenantId, `Plan changed to ${plan} (${cycle.toLowerCase()})`);
}
