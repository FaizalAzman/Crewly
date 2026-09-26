import { prisma } from "@/lib/db";
import { assertCan, audit } from "../guard";
import { DomainError, type Ctx } from "../types";

export interface SetupStep {
  key: "company" | "structure" | "profile" | "people" | "team" | "payroll";
  title: string;
  done: boolean;
  hint: string;
}

/** Workspace setup checklist, derived from the data itself (no separate state to drift). */
export async function setupProgress(tenantId: string, ownerUserId?: string) {
  const [company, depts, branches, employees, users, runs, owner] = await Promise.all([
    prisma.company.findFirst({ where: { tenantId, isDefault: true } }),
    prisma.department.count({ where: { tenantId } }),
    prisma.branch.count({ where: { tenantId } }),
    prisma.employee.count({ where: { tenantId } }),
    prisma.user.count({ where: { tenantId, active: true } }),
    prisma.payrollRun.count({ where: { tenantId } }),
    ownerUserId ? prisma.user.findUnique({ where: { id: ownerUserId } }) : null,
  ]);
  const steps: SetupStep[] = [
    { key: "company", title: "Company & statutory numbers", done: !!(company?.regNo && company.epfNo && company.socsoNo && company.taxNo), hint: "SSM, KWSP, PERKESO and LHDN employer numbers go on every payslip and submission file." },
    { key: "structure", title: "Departments & locations", done: depts > 0 && branches > 0, hint: "The branch state decides which public holidays apply." },
    { key: "profile", title: "Your own employee profile", done: !!owner?.employeeId, hint: "Optional. Lets you use leave, claims and payslips yourself." },
    { key: "people", title: "Add your employees", done: employees >= 2, hint: "Add them one by one or import a CSV." },
    { key: "team", title: "Invite your HR / payroll team", done: users >= 2, hint: "Maker-checker payroll needs a second approver." },
    { key: "payroll", title: "Run your first payroll", done: runs > 0, hint: "EPF, SOCSO, EIS and PCB are calculated automatically." },
  ];
  const done = steps.filter((s) => s.done).length;
  return { steps, done, total: steps.length, percent: Math.round((done / steps.length) * 100) };
}

export async function completeOnboarding(ctx: Ctx) {
  assertCan(ctx, "settings.manage");
  await prisma.tenant.update({ where: { id: ctx.tenantId }, data: { onboardedAt: new Date() } });
  await audit(ctx, "UPDATE", "Tenant", ctx.tenantId, "Completed workspace setup");
}

/** Quick-add departments from a comma/newline separated list (skips duplicates). */
export async function quickAddDepartments(ctx: Ctx, list: string) {
  assertCan(ctx, "org.manage");
  const byKey = new Map<string, string>();
  for (const raw of list.split(/[,\n]/)) {
    const name = raw.trim().replace(/\s+/g, " ");
    if (name && !byKey.has(name.toLowerCase())) byKey.set(name.toLowerCase(), name);
  }
  const names = [...byKey.values()];
  if (!names.length) throw new DomainError("Enter at least one department.");
  if (names.length > 30) throw new DomainError("Add up to 30 at a time.");
  const existing = await prisma.department.findMany({ where: { tenantId: ctx.tenantId } });
  const colors = ["#7C5CFF", "#FF6B35", "#5CC8FF", "#3DDC97", "#FFD23F", "#FF8FD8", "#C6F432"];
  let added = 0;
  for (const [i, name] of names.entries()) {
    if (existing.some((d) => d.name.toLowerCase() === name.toLowerCase())) continue;
    let code = name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "DEP";
    let n = 1;
    while (existing.some((d) => d.code === code) || (await prisma.department.findFirst({ where: { tenantId: ctx.tenantId, code } }))) code = `${code.slice(0, 3)}${++n}`;
    await prisma.department.create({ data: { tenantId: ctx.tenantId, name, code, color: colors[(existing.length + i) % colors.length] } });
    added++;
  }
  return added;
}
