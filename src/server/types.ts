import type { Role } from "@/lib/constants";
import type { Permission, Scope } from "@/lib/permissions";

/** Everything a service needs to know about who is acting. Independent of Next.js so services are testable. */
export interface Ctx {
  tenantId: string;
  userId: string;
  userName: string;
  /** Built-in role, or "CUSTOM" for a tenant-defined role. */
  role: Role | "CUSTOM";
  /** Display name of the role (custom role name for CUSTOM). */
  roleLabel: string;
  permissions: Permission[];
  scope: Scope;
  employeeId: string | null;
}

export type ActionState = { ok: boolean; error?: string; message?: string; data?: unknown } | null;

export class DomainError extends Error {
  constructor(message: string, public code: string = "DOMAIN") {
    super(message);
    this.name = "DomainError";
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "You don't have permission to do that.") {
    super(message, "FORBIDDEN");
  }
}
