import type { Role } from "./constants";

/** Every permission, grouped and labelled for the role editor. */
export const PERMISSION_CATALOG = {
  People: {
    "employee.view": "View employee directory & profiles",
    "employee.manage": "Add and edit employees",
    "employee.sensitive": "See sensitive data (NRIC, salary, bank)",
    "org.manage": "Manage entities, branches, departments & grades",
    "recruitment.manage": "Manage jobs & candidates",
    "lifecycle.manage": "Onboarding, offboarding & separations",
  },
  Time: {
    "leave.approve": "Approve leave",
    "leave.manage": "Manage leave policy, balances & holidays",
    "attendance.manage": "Manage attendance & rosters",
    "overtime.approve": "Approve overtime",
  },
  Money: {
    "payroll.manage": "Prepare payroll runs",
    "payroll.approve": "Approve & release payroll",
    "tax.manage": "Tax forms (EA, CP8D, TP1/TP3)",
    "claims.approve": "Approve claims",
    "claims.pay": "Manage claim types & limits",
    "loans.manage": "Approve & manage loans",
    "compensation.manage": "Increments, promotions & bonuses",
    "benefits.manage": "Benefits & insurance",
  },
  Talent: {
    "performance.review": "Review team performance",
    "performance.manage": "Run review cycles & calibration",
    "training.manage": "Manage training & HRD Corp",
  },
  Compliance: {
    "er.manage": "Disciplinary & grievances",
    "foreign.manage": "Foreign workforce & permits",
    "documents.manage": "Letters & policies",
    "assets.manage": "Company assets",
  },
  Culture: {
    "engagement.manage": "Announcements & surveys",
    "helpdesk.manage": "Answer HR helpdesk tickets",
  },
  Admin: {
    "reports.view": "Company-wide reports & analytics",
    "settings.manage": "Workspace settings, users & roles",
    "audit.view": "View audit log",
    "billing.manage": "Plan & billing",
  },
} as const;

type Catalog = typeof PERMISSION_CATALOG;
export type Permission = { [G in keyof Catalog]: keyof Catalog[G] }[keyof Catalog];

export const ALL_PERMISSIONS = Object.values(PERMISSION_CATALOG).flatMap((g) => Object.keys(g)) as Permission[];

export const permissionLabel = (p: string) => {
  for (const g of Object.values(PERMISSION_CATALOG)) if (p in g) return (g as Record<string, string>)[p];
  return p;
};

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: ALL_PERMISSIONS,
  HR_ADMIN: ALL_PERMISSIONS.filter((p) => p !== "billing.manage"),
  PAYROLL: [
    "employee.view", "employee.sensitive", "payroll.manage", "payroll.approve", "tax.manage", "claims.approve",
    "claims.pay", "loans.manage", "overtime.approve", "reports.view", "compensation.manage", "benefits.manage",
  ],
  MANAGER: ["employee.view", "leave.approve", "overtime.approve", "claims.approve", "performance.review"],
  EMPLOYEE: [],
};

/**
 * Data scope: ALL = whole company, TEAM = own reporting line (direct + indirect reports),
 * SELF = own records only.
 */
export type Scope = "ALL" | "TEAM" | "SELF";

export const ROLE_SCOPE: Record<Role, Scope> = { OWNER: "ALL", HR_ADMIN: "ALL", PAYROLL: "ALL", MANAGER: "TEAM", EMPLOYEE: "SELF" };

/**
 * Permission check. Pass a Ctx (preferred — honours custom roles) or a built-in role name.
 */
export function can(subject: { permissions: readonly string[] } | Role | string | null | undefined, permission: Permission): boolean {
  if (!subject) return false;
  if (typeof subject === "string") return (ROLE_PERMISSIONS[subject as Role] ?? []).includes(permission);
  return subject.permissions.includes(permission);
}

export function isAdminRole(role: string) {
  return role === "OWNER" || role === "HR_ADMIN";
}

export function sanitizePermissions(list: string[]): Permission[] {
  return [...new Set(list)].filter((p): p is Permission => (ALL_PERMISSIONS as string[]).includes(p));
}
