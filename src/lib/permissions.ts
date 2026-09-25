import type { Role } from "./constants";

export type Permission =
  | "org.manage"
  | "employee.view"
  | "employee.manage"
  | "employee.sensitive"
  | "recruitment.manage"
  | "lifecycle.manage"
  | "leave.manage"
  | "leave.approve"
  | "attendance.manage"
  | "overtime.approve"
  | "payroll.manage"
  | "payroll.approve"
  | "tax.manage"
  | "claims.approve"
  | "claims.pay"
  | "loans.manage"
  | "compensation.manage"
  | "benefits.manage"
  | "performance.manage"
  | "performance.review"
  | "training.manage"
  | "assets.manage"
  | "er.manage"
  | "foreign.manage"
  | "documents.manage"
  | "engagement.manage"
  | "helpdesk.manage"
  | "reports.view"
  | "settings.manage"
  | "billing.manage"
  | "audit.view";

const ALL: Permission[] = [
  "org.manage", "employee.view", "employee.manage", "employee.sensitive", "recruitment.manage", "lifecycle.manage",
  "leave.manage", "leave.approve", "attendance.manage", "overtime.approve", "payroll.manage", "payroll.approve",
  "tax.manage", "claims.approve", "claims.pay", "loans.manage", "compensation.manage", "benefits.manage",
  "performance.manage", "performance.review", "training.manage", "assets.manage", "er.manage", "foreign.manage",
  "documents.manage", "engagement.manage", "helpdesk.manage", "reports.view", "settings.manage", "billing.manage",
  "audit.view",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: ALL,
  HR_ADMIN: ALL.filter((p) => p !== "billing.manage"),
  PAYROLL: [
    "employee.view", "employee.sensitive", "payroll.manage", "payroll.approve", "tax.manage", "claims.approve",
    "claims.pay", "loans.manage", "overtime.approve", "reports.view", "compensation.manage", "benefits.manage",
  ],
  MANAGER: ["employee.view", "leave.approve", "overtime.approve", "claims.approve", "performance.review", "reports.view"],
  EMPLOYEE: [],
};

export function can(role: Role | string, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role as Role] ?? []).includes(permission);
}

export function isAdminRole(role: string) {
  return role === "OWNER" || role === "HR_ADMIN";
}
