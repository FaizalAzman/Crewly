import { ROLE_LABEL, type Role } from "@/lib/constants";
import { ROLE_PERMISSIONS, ROLE_SCOPE, sanitizePermissions, type Scope } from "@/lib/permissions";
import type { Ctx } from "./types";

interface UserLike {
  id: string;
  tenantId: string;
  name: string;
  role: string;
  employeeId: string | null;
  customRole?: { name: string; permissions: string; scope: string } | null;
}

/** Resolves a user (with optional custom role) into an acting context. Framework-free. */
export function ctxFromUser(user: UserLike): Ctx {
  if (user.role === "CUSTOM" && user.customRole) {
    let perms: string[] = [];
    try {
      perms = JSON.parse(user.customRole.permissions);
    } catch {
      perms = [];
    }
    return {
      tenantId: user.tenantId,
      userId: user.id,
      userName: user.name,
      role: "CUSTOM",
      roleLabel: user.customRole.name,
      permissions: sanitizePermissions(perms),
      scope: (["ALL", "TEAM"].includes(user.customRole.scope) ? user.customRole.scope : "TEAM") as Scope,
      employeeId: user.employeeId,
    };
  }
  // Unknown / orphaned custom role → least privilege.
  const role = (user.role in ROLE_PERMISSIONS ? user.role : "EMPLOYEE") as Role;
  return {
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name,
    role,
    roleLabel: ROLE_LABEL[role],
    permissions: [...ROLE_PERMISSIONS[role]],
    scope: ROLE_SCOPE[role],
    employeeId: user.employeeId,
  };
}
