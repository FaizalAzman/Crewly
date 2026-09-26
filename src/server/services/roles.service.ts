import { prisma } from "@/lib/db";
import { ROLE_LABEL, ROLES } from "@/lib/constants";
import { ROLE_PERMISSIONS, sanitizePermissions, type Permission } from "@/lib/permissions";
import { assertCan, audit } from "../guard";
import { DomainError, ForbiddenError, type Ctx } from "../types";

export interface CustomRoleInput {
  id?: string;
  name: string;
  description?: string | null;
  permissions: string[];
  scope: "ALL" | "TEAM";
}

/**
 * A non-owner can only hand out permissions they hold themselves — this prevents privilege escalation
 * (e.g. an HR admin creating a role with billing access and giving it to a colleague).
 */
export function assertNoEscalation(ctx: Ctx, permissions: readonly Permission[]) {
  if (ctx.role === "OWNER") return;
  const missing = permissions.filter((p) => !ctx.permissions.includes(p));
  if (missing.length) throw new ForbiddenError(`You can't grant permissions you don't have yourself: ${missing.join(", ")}.`);
}

export async function saveCustomRole(ctx: Ctx, input: CustomRoleInput) {
  assertCan(ctx, "settings.manage");
  const name = input.name.trim();
  if (name.length < 2) throw new DomainError("Give the role a name.");
  if ([...ROLES, "CUSTOM"].includes(name.toUpperCase().replace(/\s+/g, "_")) || Object.values(ROLE_LABEL).some((l) => l.toLowerCase() === name.toLowerCase())) {
    throw new DomainError("That name is reserved for a built-in role.");
  }
  const permissions = sanitizePermissions(input.permissions);
  if (!permissions.length) throw new DomainError("Pick at least one permission.");
  if (!["ALL", "TEAM"].includes(input.scope)) throw new DomainError("Scope must be company-wide or team.");
  assertNoEscalation(ctx, permissions);

  const dup = await prisma.customRole.findFirst({ where: { tenantId: ctx.tenantId, name, NOT: input.id ? { id: input.id } : undefined } });
  if (dup) throw new DomainError("A role with that name already exists.");

  const data = { name, description: input.description ?? null, permissions: JSON.stringify(permissions), scope: input.scope };
  if (input.id) {
    const existing = await prisma.customRole.findFirst({ where: { id: input.id, tenantId: ctx.tenantId } });
    if (!existing) throw new DomainError("Role not found.");
    const role = await prisma.customRole.update({ where: { id: input.id }, data });
    await audit(ctx, "UPDATE", "CustomRole", role.id, `Updated role "${name}" (${permissions.length} permissions, ${input.scope.toLowerCase()} scope)`);
    return role;
  }
  const role = await prisma.customRole.create({ data: { ...data, tenantId: ctx.tenantId } });
  await audit(ctx, "CREATE", "CustomRole", role.id, `Created role "${name}" (${permissions.length} permissions, ${input.scope.toLowerCase()} scope)`);
  return role;
}

export async function deleteCustomRole(ctx: Ctx, id: string) {
  assertCan(ctx, "settings.manage");
  const role = await prisma.customRole.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { _count: { select: { users: true } } } });
  if (!role) throw new DomainError("Role not found.");
  if (role._count.users > 0) throw new DomainError(`${role._count.users} user(s) still have this role. Reassign them first.`);
  await prisma.customRole.delete({ where: { id } });
  await audit(ctx, "DELETE", "CustomRole", id, `Deleted role "${role.name}"`);
}

/** Parses a role key: a built-in role ("MANAGER") or "CUSTOM:<id>". */
export async function resolveRoleKey(ctx: Ctx, key: string): Promise<{ role: string; customRoleId: string | null; permissions: Permission[]; label: string }> {
  if (key.startsWith("CUSTOM:")) {
    const role = await prisma.customRole.findFirst({ where: { id: key.slice(7), tenantId: ctx.tenantId } });
    if (!role) throw new DomainError("Role not found.");
    return { role: "CUSTOM", customRoleId: role.id, permissions: sanitizePermissions(JSON.parse(role.permissions)), label: role.name };
  }
  if (!(ROLES as readonly string[]).includes(key)) throw new DomainError("Unknown role.");
  return { role: key, customRoleId: null, permissions: ROLE_PERMISSIONS[key as keyof typeof ROLE_PERMISSIONS], label: ROLE_LABEL[key as keyof typeof ROLE_LABEL] };
}

/** Roles the actor may assign, for dropdowns: built-ins + custom, minus anything that would escalate privileges. */
export async function assignableRoles(ctx: Ctx) {
  const custom = await prisma.customRole.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { name: "asc" } });
  const ok = (perms: readonly string[]) => ctx.role === "OWNER" || perms.every((p) => ctx.permissions.includes(p as Permission));
  return [
    ...ROLES.filter((r) => (r === "OWNER" ? ctx.role === "OWNER" : ok(ROLE_PERMISSIONS[r]))).map((r) => ({ value: r as string, label: ROLE_LABEL[r] })),
    ...custom.filter((c) => ok(JSON.parse(c.permissions))).map((c) => ({ value: `CUSTOM:${c.id}`, label: `${c.name} (custom)` })),
  ];
}
