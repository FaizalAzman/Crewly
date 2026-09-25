import type { Role } from "@/lib/constants";

/** Everything a service needs to know about who is acting. Independent of Next.js so services are testable. */
export interface Ctx {
  tenantId: string;
  userId: string;
  userName: string;
  role: Role;
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
