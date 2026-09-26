import { prisma } from "@/lib/db";
import { parseCsv, parseDate } from "@/lib/utils";
import { assertCan, audit } from "../guard";
import { DomainError, type Ctx } from "../types";
import { createEmployee, employeeSchema, validateEmployeeRules, type EmployeeInput } from "./employee.service";

export const IMPORT_COLUMNS = [
  "fullName", "email", "icNo", "passportNo", "citizenship", "gender", "race", "religion", "maritalStatus", "spouseWorking",
  "jobTitle", "department", "branch", "managerEmail", "employmentType", "joinDate", "probationMonths", "contractEndDate",
  "basicSalary", "phone", "bankName", "bankAccountNo", "epfNo", "socsoNo", "taxNo",
] as const;

export interface ImportRowResult {
  row: number;
  name: string;
  ok: boolean;
  error?: string;
  employeeNo?: string;
}

const yes = (v: string) => ["y", "yes", "true", "1"].includes(v.trim().toLowerCase());

/**
 * Bulk-imports employees from CSV. Headers must match IMPORT_COLUMNS (order-free, case-insensitive).
 * Each row is validated with the same rules as the form; bad rows are reported, good rows imported.
 * With dryRun, nothing is written.
 */
export async function importEmployees(ctx: Ctx, csv: string, opts: { dryRun?: boolean } = {}) {
  assertCan(ctx, "employee.manage");
  const rows = parseCsv(csv);
  if (rows.length < 2) throw new DomainError("The file needs a header row and at least one employee.");
  if (rows.length > 501) throw new DomainError("Import up to 500 employees at a time.");
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = ["fullname", "email", "jobtitle", "joindate", "basicsalary"].filter((c) => !header.includes(c));
  if (missing.length) throw new DomainError(`Missing required column(s): ${missing.join(", ")}.`);
  const col = (r: string[], name: string) => (r[header.indexOf(name.toLowerCase())] ?? "").trim();

  const [depts, branches, company] = await Promise.all([
    prisma.department.findMany({ where: { tenantId: ctx.tenantId } }),
    prisma.branch.findMany({ where: { tenantId: ctx.tenantId } }),
    prisma.company.findFirst({ where: { tenantId: ctx.tenantId, isDefault: true } }),
  ]);
  const seenEmails = new Set<string>();
  const results: ImportRowResult[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const name = col(r, "fullName");
    try {
      const email = col(r, "email").toLowerCase();
      if (seenEmails.has(email)) throw new DomainError("Duplicate email within the file.");
      seenEmails.add(email);
      const dept = col(r, "department");
      const d = dept ? depts.find((x) => x.code.toLowerCase() === dept.toLowerCase() || x.name.toLowerCase() === dept.toLowerCase()) : undefined;
      if (dept && !d) throw new DomainError(`Unknown department "${dept}".`);
      const br = col(r, "branch");
      const b = br ? branches.find((x) => x.name.toLowerCase().includes(br.toLowerCase())) : undefined;
      if (br && !b) throw new DomainError(`Unknown branch "${br}".`);
      const mgrEmail = col(r, "managerEmail").toLowerCase();
      const mgr = mgrEmail ? await prisma.employee.findFirst({ where: { tenantId: ctx.tenantId, email: mgrEmail } }) : null;
      if (mgrEmail && !mgr) throw new DomainError(`Manager ${mgrEmail} not found (import managers first).`);
      const joinDate = parseDate(col(r, "joinDate"));
      if (!joinDate) throw new DomainError("joinDate must be YYYY-MM-DD.");
      const salary = Number(col(r, "basicSalary").replace(/[,RM\s]/gi, ""));
      if (!Number.isFinite(salary)) throw new DomainError("basicSalary must be a number.");

      const input: EmployeeInput = {
        fullName: name,
        email,
        icNo: col(r, "icNo") || null,
        passportNo: col(r, "passportNo") || null,
        citizenship: ((col(r, "citizenship") || "CITIZEN").toUpperCase() as "CITIZEN"),
        gender: (col(r, "gender").toUpperCase() || undefined) as "MALE" | undefined,
        race: col(r, "race").toUpperCase() || "MALAY",
        religion: col(r, "religion").toUpperCase() || "ISLAM",
        maritalStatus: ((col(r, "maritalStatus") || "SINGLE").toUpperCase() as "SINGLE"),
        spouseWorking: yes(col(r, "spouseWorking")),
        jobTitle: col(r, "jobTitle"),
        departmentId: d?.id ?? null,
        branchId: b?.id ?? null,
        managerId: mgr?.id ?? null,
        employmentType: ((col(r, "employmentType") || "PERMANENT").toUpperCase() as "PERMANENT"),
        joinDate,
        probationMonths: col(r, "probationMonths") ? Number(col(r, "probationMonths")) : 3,
        contractEndDate: parseDate(col(r, "contractEndDate")),
        basicSalary: salary,
        phone: col(r, "phone") || null,
        bankName: col(r, "bankName") || null,
        bankAccountNo: col(r, "bankAccountNo") || null,
        epfNo: col(r, "epfNo") || null,
        socsoNo: col(r, "socsoNo") || null,
        taxNo: col(r, "taxNo") || null,
        companyId: b?.companyId ?? company?.id,
      };
      if (opts.dryRun) {
        validateEmployeeRules(employeeSchema.parse(input));
        if (await prisma.employee.findFirst({ where: { tenantId: ctx.tenantId, email, status: { notIn: ["RESIGNED", "TERMINATED", "RETIRED"] } } })) {
          throw new DomainError("An active employee with that email already exists.");
        }
        results.push({ row: i + 1, name, ok: true });
      } else {
        const e = await createEmployee(ctx, input);
        results.push({ row: i + 1, name, ok: true, employeeNo: e.employeeNo });
      }
    } catch (err) {
      const msg = err instanceof DomainError ? err.message : err instanceof Error && "issues" in err ? (err as { issues: { path: (string | number)[]; message: string }[] }).issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") : "Invalid row";
      results.push({ row: i + 1, name: name || "(no name)", ok: false, error: msg });
    }
  }
  if (!opts.dryRun) await audit(ctx, "CREATE", "Employee", null, `Imported ${results.filter((r) => r.ok).length} of ${results.length} employees from CSV`);
  return results;
}
