import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseNric } from "@/lib/nric";
import { MINIMUM_WAGE } from "@/lib/statutory/employment-act";
import { addDays, pick } from "@/lib/utils";
import { assertCan, audit } from "../guard";
import { DomainError, type Ctx } from "../types";
import { initLeaveBalances } from "./leave.service";
import { createChecklistFromTemplate } from "./lifecycle.service";
import { hashPassword } from "./auth.service";
import { assertNoEscalation, resolveRoleKey } from "./roles.service";

const AVATAR_COLORS = ["#FFD23F", "#C6F432", "#5CC8FF", "#FF8FD8", "#FF6B35", "#3DDC97", "#B69CFF", "#FFB4A2"];

export const employeeSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  preferredName: z.string().optional().nullable(),
  email: z.string().email("A valid email is required"),
  phone: z.string().optional().nullable(),
  icNo: z.string().optional().nullable(),
  passportNo: z.string().optional().nullable(),
  passportExpiry: z.date().optional().nullable(),
  dateOfBirth: z.date().optional().nullable(),
  gender: z.enum(["MALE", "FEMALE"]).optional(),
  race: z.string().default("MALAY"),
  religion: z.string().default("ISLAM"),
  nationality: z.string().default("Malaysia"),
  citizenship: z.enum(["CITIZEN", "PR", "FOREIGNER"]).default("CITIZEN"),
  maritalStatus: z.enum(["SINGLE", "MARRIED", "DIVORCED", "WIDOWED"]).default("SINGLE"),
  spouseName: z.string().optional().nullable(),
  spouseWorking: z.boolean().default(false),
  spouseDisabled: z.boolean().default(false),
  disabled: z.boolean().default(false),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  postcode: z.string().optional().nullable(),
  state: z.string().default("SELANGOR"),
  emergencyName: z.string().optional().nullable(),
  emergencyPhone: z.string().optional().nullable(),
  emergencyRelation: z.string().optional().nullable(),
  companyId: z.string().optional(),
  branchId: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  positionId: z.string().optional().nullable(),
  gradeId: z.string().optional().nullable(),
  managerId: z.string().optional().nullable(),
  jobTitle: z.string().min(1, "Job title is required"),
  employmentType: z.enum(["PERMANENT", "CONTRACT", "PROBATION", "INTERN", "PART_TIME"]).default("PERMANENT"),
  joinDate: z.date({ message: "Join date is required" }),
  probationMonths: z.number().int().min(0).max(12).default(3),
  contractEndDate: z.date().optional().nullable(),
  basicSalary: z.number().min(0, "Salary can't be negative"),
  paymentMethod: z.enum(["BANK", "CHEQUE", "CASH"]).default("BANK"),
  bankName: z.string().optional().nullable(),
  bankAccountNo: z.string().optional().nullable(),
  epfNo: z.string().optional().nullable(),
  socsoNo: z.string().optional().nullable(),
  taxNo: z.string().optional().nullable(),
  taxResident: z.boolean().default(true),
  zakatMonthly: z.number().min(0).default(0),
  epfEmployeeRate: z.number().min(0).max(100).optional().nullable(),
  epfEmployerRate: z.number().min(0).max(100).optional().nullable(),
  hrdfApplicable: z.boolean().default(true),
  workHoursPerDay: z.number().min(1).max(12).default(8),
  employeeNo: z.string().optional(),
});

export type EmployeeInput = z.input<typeof employeeSchema>;

/** Business validations shared by create & update. Returns normalized data. */
export function validateEmployeeRules(data: z.output<typeof employeeSchema>) {
  const out = { ...data };
  if (out.citizenship !== "FOREIGNER") {
    if (!out.icNo) throw new DomainError("MyKad (NRIC) number is required for Malaysian citizens and PRs.");
    const nric = parseNric(out.icNo);
    if (!nric.valid) throw new DomainError("That NRIC doesn't look valid (expected YYMMDD-PB-####).");
    out.icNo = nric.normalized;
    out.dateOfBirth = out.dateOfBirth ?? nric.dateOfBirth;
    out.gender = out.gender ?? nric.gender ?? "MALE";
  } else {
    if (!out.passportNo) throw new DomainError("Passport number is required for foreign employees.");
    out.hrdfApplicable = false;
  }
  if (out.maritalStatus !== "MARRIED") {
    out.spouseWorking = false;
    out.spouseDisabled = false;
  }
  const fullTime = ["PERMANENT", "CONTRACT", "PROBATION"].includes(out.employmentType);
  if (fullTime && out.basicSalary < MINIMUM_WAGE) {
    throw new DomainError(`Basic salary is below the national minimum wage of RM${MINIMUM_WAGE.toLocaleString()} (Minimum Wages Order 2024).`);
  }
  if (out.employmentType === "CONTRACT" && !out.contractEndDate) throw new DomainError("Contract employees need a contract end date.");
  if (out.contractEndDate && out.contractEndDate <= out.joinDate) throw new DomainError("Contract end date must be after the join date.");
  return out;
}

export async function nextEmployeeNo(tenantId: string) {
  const count = await prisma.employee.count({ where: { tenantId } });
  let n = count + 1;
  // Guard against gaps / collisions.
  while (await prisma.employee.findFirst({ where: { tenantId, employeeNo: `EMP${String(n).padStart(4, "0")}` } })) n++;
  return `EMP${String(n).padStart(4, "0")}`;
}

export async function createEmployee(ctx: Ctx, input: EmployeeInput, opts: { createLogin?: boolean; loginPassword?: string; skipOnboarding?: boolean } = {}) {
  assertCan(ctx, "employee.manage");
  const data = validateEmployeeRules(employeeSchema.parse(input));

  const companyId = data.companyId ?? (await prisma.company.findFirst({ where: { tenantId: ctx.tenantId, isDefault: true } }))?.id;
  if (!companyId) throw new DomainError("Create a company (legal entity) first.");
  const company = await prisma.company.findFirst({ where: { id: companyId, tenantId: ctx.tenantId } });
  if (!company) throw new DomainError("Company not found.");

  const email = data.email.toLowerCase();
  if (await prisma.employee.findFirst({ where: { tenantId: ctx.tenantId, email, status: { notIn: ["RESIGNED", "TERMINATED", "RETIRED"] } } })) {
    throw new DomainError("An active employee with that email already exists.");
  }
  if (data.icNo && (await prisma.employee.findFirst({ where: { tenantId: ctx.tenantId, icNo: data.icNo, status: { notIn: ["RESIGNED", "TERMINATED", "RETIRED"] } } }))) {
    throw new DomainError("An active employee with that NRIC already exists.");
  }
  if (data.managerId && !(await prisma.employee.findFirst({ where: { id: data.managerId, tenantId: ctx.tenantId } }))) {
    throw new DomainError("Manager not found.");
  }

  const employeeNo = data.employeeNo || (await nextEmployeeNo(ctx.tenantId));
  if (await prisma.employee.findFirst({ where: { tenantId: ctx.tenantId, employeeNo } })) throw new DomainError(`Employee number ${employeeNo} is taken.`);

  const onProbation = data.employmentType === "PROBATION" || (data.probationMonths > 0 && data.employmentType === "PERMANENT");
  const confirmationDate = onProbation ? addMonths(data.joinDate, data.probationMonths) : data.joinDate;
  const count = await prisma.employee.count({ where: { tenantId: ctx.tenantId } });

  const { employeeNo: _ignored, companyId: _c, ...rest } = data;
  void _ignored;
  void _c;
  const employee = await prisma.employee.create({
    data: {
      ...rest,
      email,
      tenantId: ctx.tenantId,
      companyId,
      employeeNo,
      preferredName: data.preferredName || data.fullName.split(" ")[0],
      gender: data.gender ?? "MALE",
      status: onProbation ? "PROBATION" : "ACTIVE",
      confirmationDate,
      avatarColor: pick(AVATAR_COLORS, count),
      history: { create: { effectiveDate: data.joinDate, type: "JOINED", title: `Joined as ${data.jobTitle}`, details: `Basic salary RM${data.basicSalary.toLocaleString()}` } },
    },
  });

  await initLeaveBalances(ctx.tenantId, employee.id, data.joinDate.getUTCFullYear() > new Date().getUTCFullYear() ? data.joinDate.getUTCFullYear() : new Date().getUTCFullYear());
  if (!opts.skipOnboarding) await createChecklistFromTemplate(ctx, employee.id, "ONBOARDING", data.joinDate);
  if (opts.createLogin) {
    await prisma.user.create({
      data: {
        tenantId: ctx.tenantId,
        email,
        name: data.fullName,
        role: "EMPLOYEE",
        employeeId: employee.id,
        passwordHash: await hashPassword(opts.loginPassword ?? Math.random().toString(36).slice(2, 12)),
      },
    });
  }
  await audit(ctx, "CREATE", "Employee", employee.id, `Added ${employee.fullName} (${employeeNo})`);
  return employee;
}

export async function updateEmployee(ctx: Ctx, id: string, input: Partial<EmployeeInput>) {
  assertCan(ctx, "employee.manage");
  const existing = await prisma.employee.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) throw new DomainError("Employee not found.");
  const merged = validateEmployeeRules(
    employeeSchema.parse({
      ...existing,
      ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)),
    }),
  );
  if (merged.managerId === id) throw new DomainError("An employee can't report to themselves.");
  if (merged.managerId) {
    // prevent cycles: walk up from the proposed manager
    let cursor: string | null = merged.managerId;
    for (let i = 0; cursor && i < 20; i++) {
      if (cursor === id) throw new DomainError("That would create a reporting loop.");
      const m: { managerId: string | null } | null = await prisma.employee.findUnique({ where: { id: cursor }, select: { managerId: true } });
      cursor = m?.managerId ?? null;
    }
  }

  const { employeeNo: _n, companyId, ...rest } = merged;
  void _n;
  const updated = await prisma.employee.update({ where: { id }, data: { ...rest, companyId: companyId ?? existing.companyId, email: merged.email.toLowerCase() } });

  const changes: string[] = [];
  if (existing.basicSalary !== updated.basicSalary) changes.push(`salary RM${existing.basicSalary} → RM${updated.basicSalary}`);
  if (existing.jobTitle !== updated.jobTitle) changes.push(`title "${existing.jobTitle}" → "${updated.jobTitle}"`);
  if (existing.departmentId !== updated.departmentId) changes.push("department changed");
  if (changes.length) {
    await prisma.employmentHistory.create({
      data: {
        employeeId: id,
        effectiveDate: new Date(),
        type: existing.jobTitle !== updated.jobTitle ? "REDESIGNATION" : existing.departmentId !== updated.departmentId ? "TRANSFER" : "INCREMENT",
        title: changes.join("; "),
      },
    });
  }
  await audit(ctx, "UPDATE", "Employee", id, `Updated ${updated.fullName}${changes.length ? `: ${changes.join("; ")}` : ""}`);
  return updated;
}

export async function confirmEmployee(ctx: Ctx, id: string, date: Date = new Date()) {
  assertCan(ctx, "employee.manage");
  const e = await prisma.employee.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!e) throw new DomainError("Employee not found.");
  if (e.status !== "PROBATION") throw new DomainError("Only employees on probation can be confirmed.");
  const updated = await prisma.employee.update({
    where: { id },
    data: { status: "ACTIVE", confirmationDate: date, employmentType: e.employmentType === "PROBATION" ? "PERMANENT" : e.employmentType },
  });
  await prisma.employmentHistory.create({ data: { employeeId: id, effectiveDate: date, type: "CONFIRMED", title: "Confirmed in employment 🎉" } });
  await audit(ctx, "UPDATE", "Employee", id, `Confirmed ${e.fullName}`);
  return updated;
}

export async function extendProbation(ctx: Ctx, id: string, months: number) {
  assertCan(ctx, "employee.manage");
  const e = await prisma.employee.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!e || e.status !== "PROBATION") throw new DomainError("Employee is not on probation.");
  if (months < 1 || months > 6) throw new DomainError("Probation can be extended by 1 – 6 months.");
  const base = e.confirmationDate ?? addMonths(e.joinDate, e.probationMonths);
  const updated = await prisma.employee.update({
    where: { id },
    data: { confirmationDate: addMonths(base, months), probationMonths: e.probationMonths + months },
  });
  await prisma.employmentHistory.create({
    data: { employeeId: id, effectiveDate: new Date(), type: "PROBATION_EXTENDED", title: `Probation extended by ${months} month(s)` },
  });
  return updated;
}

export async function addChild(ctx: Ctx, employeeId: string, input: { name: string; dateOfBirth: Date; studying?: boolean; disabled?: boolean }) {
  if (ctx.employeeId !== employeeId) assertCan(ctx, "employee.manage");
  if (!input.name) throw new DomainError("Child's name is required.");
  if (input.dateOfBirth > new Date()) throw new DomainError("Date of birth can't be in the future.");
  return prisma.employeeChild.create({ data: { employeeId, ...input } });
}

export async function createLoginForEmployee(ctx: Ctx, employeeId: string, roleKey: string, password: string) {
  assertCan(ctx, "settings.manage");
  const e = await prisma.employee.findFirst({ where: { id: employeeId, tenantId: ctx.tenantId }, include: { user: true } });
  if (!e) throw new DomainError("Employee not found.");
  if (e.user) throw new DomainError("This employee already has a login.");
  const target = await resolveRoleKey(ctx, roleKey);
  if (target.role === "OWNER" && ctx.role !== "OWNER") throw new DomainError("Only an owner can create another owner.");
  assertNoEscalation(ctx, target.permissions);
  if (password.length < 8) throw new DomainError("Password must be at least 8 characters.");
  if (await prisma.user.findUnique({ where: { email: e.email } })) throw new DomainError("A user with this email already exists.");
  const user = await prisma.user.create({
    data: { tenantId: ctx.tenantId, email: e.email, name: e.fullName, role: target.role, customRoleId: target.customRoleId, employeeId, passwordHash: await hashPassword(password) },
  });
  await audit(ctx, "CREATE", "User", user.id, `Created ${target.label} login for ${e.fullName}`);
  return user;
}

export function addMonths(d: Date, months: number) {
  const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()));
  // clamp (e.g. 31 Jan + 1 month → 28/29 Feb)
  if (r.getUTCDate() !== d.getUTCDate()) return addDays(new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth(), 1)), -1);
  return r;
}

export interface OwnProfileInput {
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  postcode?: string | null;
  state?: string;
  emergencyName?: string | null;
  emergencyPhone?: string | null;
  emergencyRelation?: string | null;
  bankName?: string | null;
  bankAccountNo?: string | null;
}

/**
 * PDPA access & correction: employees may update their own contact, address, emergency contact and bank details.
 * Identity, job and pay fields stay HR-controlled. Bank changes are audited and HR is notified (fraud control).
 */
export async function updateOwnProfile(ctx: Ctx, input: OwnProfileInput) {
  if (!ctx.employeeId) throw new DomainError("Your login isn't linked to an employee profile.");
  const e = await prisma.employee.findUniqueOrThrow({ where: { id: ctx.employeeId } });
  if (input.postcode && !/^\d{5}$/.test(input.postcode)) throw new DomainError("Malaysian postcodes have 5 digits.");
  if (input.bankAccountNo && !/^\d{6,20}$/.test(input.bankAccountNo.replace(/[\s-]/g, ""))) throw new DomainError("Bank account numbers are 6–20 digits.");
  const allowed: (keyof OwnProfileInput)[] = ["phone", "address", "city", "postcode", "state", "emergencyName", "emergencyPhone", "emergencyRelation", "bankName", "bankAccountNo"];
  const data = Object.fromEntries(allowed.filter((k) => input[k] !== undefined).map((k) => [k, k === "bankAccountNo" && input[k] ? String(input[k]).replace(/[\s-]/g, "") : input[k]]));
  const bankChanged = (data.bankName !== undefined && data.bankName !== e.bankName) || (data.bankAccountNo !== undefined && data.bankAccountNo !== e.bankAccountNo);
  const updated = await prisma.employee.update({ where: { id: e.id }, data });
  await audit(ctx, "UPDATE", "Employee", e.id, `${e.fullName} updated own profile${bankChanged ? " (BANK DETAILS CHANGED)" : ""}`);
  if (bankChanged) {
    const hr = await prisma.user.findMany({ where: { tenantId: ctx.tenantId, active: true, role: { in: ["OWNER", "HR_ADMIN", "PAYROLL"] } } });
    for (const u of hr) await prisma.notification.create({ data: { userId: u.id, title: `${e.fullName} changed their bank details`, body: "Verify before the next payroll.", link: `/employees/${e.id}?tab=pay` } });
  }
  return updated;
}
