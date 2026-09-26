/**
 * Test factory for business-rule specs: builds an isolated tenant with users in every role,
 * and helpers to create employees through the real services.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { bootstrapTenant } from "@/server/services/bootstrap.service";
import { createEmployee, type EmployeeInput } from "@/server/services/employee.service";
import type { Ctx } from "@/server/types";
import { ctxFromUser } from "@/server/ctx";
import type { Role } from "@/lib/constants";

export const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

let icSeq = 1000;
/** Valid, unique KL-born NRIC. Odd last digit = male, even = female. */
export function nric(dob = "900101", gender: "MALE" | "FEMALE" = "MALE") {
  icSeq++;
  const tail = String(icSeq % 1000).padStart(3, "0");
  return `${dob}-14-${tail}${gender === "MALE" ? 1 : 2}`;
}

export interface World {
  tenantId: string;
  companyId: string;
  owner: Ctx;
  hr: Ctx;
  payroll: Ctx;
  /** Manager with an employee profile (approver for their reports). */
  manager: Ctx;
  managerEmployeeId: string;
  /** Plain employee with a login. */
  employee: Ctx;
  employeeId: string;
  emp: (overrides?: Partial<EmployeeInput>, opts?: { login?: Role }) => Promise<{ id: string; ctx: Ctx | null }>;
  ctxFor: (employeeId: string, role: Role) => Promise<Ctx>;
}

export async function makeWorld(opts: { state?: string; withBranchGeofence?: boolean } = {}): Promise<World> {
  const suffix = randomUUID().slice(0, 8);
  const tenant = await prisma.tenant.create({ data: { name: `Test Co ${suffix}`, slug: `t-${suffix}`, plan: "ENTERPRISE", restDay: 0, offDay: 6, workDaysPerWeek: 5 } });
  const company = await prisma.company.create({
    data: { tenantId: tenant.id, name: `Test Co ${suffix} Sdn Bhd`, state: opts.state ?? "KUALA_LUMPUR", isDefault: true, epfNo: "12345678", socsoNo: "E100000000Z", taxNo: "E 1234567890" },
  });
  await bootstrapTenant(tenant.id);
  if (opts.withBranchGeofence) {
    await prisma.branch.create({ data: { tenantId: tenant.id, companyId: company.id, name: "HQ", state: opts.state ?? "KUALA_LUMPUR", latitude: 3.1106, longitude: 101.6653, geofenceMeters: 200 } });
  }

  const mkUser = async (role: Role, employeeId: string | null = null): Promise<Ctx> => {
    const u = await prisma.user.create({
      data: { tenantId: tenant.id, email: `${role.toLowerCase()}-${randomUUID().slice(0, 8)}@test.my`, name: `${role} User`, role, employeeId, passwordHash: "x" },
    });
    return ctxFromUser(u);
  };

  const owner = await mkUser("OWNER");
  const hr = await mkUser("HR_ADMIN");
  const payroll = await mkUser("PAYROLL");

  const emp: World["emp"] = async (overrides = {}, o = {}) => {
    const gender = overrides.gender ?? "MALE";
    const e = await createEmployee(owner, {
      fullName: `Employee ${randomUUID().slice(0, 6)}`,
      email: `e-${randomUUID().slice(0, 8)}@test.my`,
      icNo: overrides.citizenship === "FOREIGNER" ? null : nric("900101", gender),
      jobTitle: "Executive",
      joinDate: D("2023-01-02"),
      basicSalary: 5000,
      probationMonths: 0,
      companyId: company.id,
      ...overrides,
    }, { skipOnboarding: false });
    const ctx = o.login ? await mkUser(o.login, e.id) : null;
    return { id: e.id, ctx };
  };

  const mgr = await emp({ fullName: "Manager Person", jobTitle: "Manager", basicSalary: 12000, maritalStatus: "MARRIED" });
  const manager = await mkUser("MANAGER", mgr.id);
  const staff = await emp({ fullName: "Staff Person", managerId: mgr.id, maritalStatus: "MARRIED" });
  const employee = await mkUser("EMPLOYEE", staff.id);

  return {
    tenantId: tenant.id,
    companyId: company.id,
    owner,
    hr,
    payroll,
    manager,
    managerEmployeeId: mgr.id,
    employee,
    employeeId: staff.id,
    emp,
    ctxFor: (employeeId, role) => mkUser(role, employeeId),
  };
}

export async function leaveType(tenantId: string, code: string) {
  return prisma.leaveType.findFirstOrThrow({ where: { tenantId, code } });
}

export async function balance(employeeId: string, tenantId: string, code: string, year: number) {
  const t = await leaveType(tenantId, code);
  return prisma.leaveBalance.findUnique({ where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: t.id, year } } });
}
