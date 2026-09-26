import { prisma } from "@/lib/db";
import { assertCan, audit } from "../guard";
import { DomainError, type Ctx } from "../types";

export type OrgEntity = "company" | "branch" | "department" | "position" | "grade";

/** Deletes an org unit only when nothing depends on it. */
export async function deleteOrgUnit(ctx: Ctx, kind: OrgEntity, id: string) {
  assertCan(ctx, "org.manage");
  const T = ctx.tenantId;
  switch (kind) {
    case "company": {
      const c = await prisma.company.findFirst({ where: { id, tenantId: T }, include: { _count: { select: { employees: true, payrollRuns: true } } } });
      if (!c) throw new DomainError("Company not found.");
      if (c.isDefault) throw new DomainError("The default legal entity can't be deleted.");
      if (c._count.employees) throw new DomainError(`${c._count.employees} employee(s) still belong to this entity.`);
      if (c._count.payrollRuns) throw new DomainError("This entity has payroll history, which must be kept for 7 years.");
      await prisma.company.delete({ where: { id } });
      break;
    }
    case "branch": {
      const b = await prisma.branch.findFirst({ where: { id, tenantId: T }, include: { _count: { select: { employees: true } } } });
      if (!b) throw new DomainError("Branch not found.");
      if (b._count.employees) throw new DomainError(`${b._count.employees} employee(s) still work at this branch. Move them first.`);
      await prisma.branch.delete({ where: { id } });
      break;
    }
    case "department": {
      const d = await prisma.department.findFirst({ where: { id, tenantId: T }, include: { _count: { select: { employees: true, children: true } } } });
      if (!d) throw new DomainError("Department not found.");
      if (d._count.employees) throw new DomainError(`${d._count.employees} employee(s) are in this department. Move them first.`);
      if (d._count.children) throw new DomainError("This department has sub-departments. Re-parent them first.");
      await prisma.department.delete({ where: { id } });
      break;
    }
    case "position": {
      const p = await prisma.position.findFirst({ where: { id, tenantId: T }, include: { _count: { select: { employees: true } } } });
      if (!p) throw new DomainError("Position not found.");
      if (p._count.employees) throw new DomainError(`${p._count.employees} employee(s) hold this position.`);
      await prisma.position.delete({ where: { id } });
      break;
    }
    case "grade": {
      const g = await prisma.jobGrade.findFirst({ where: { id, tenantId: T }, include: { _count: { select: { employees: true, positions: true } } } });
      if (!g) throw new DomainError("Grade not found.");
      if (g._count.employees || g._count.positions) throw new DomainError("This grade is still used by employees or positions.");
      await prisma.jobGrade.delete({ where: { id } });
      break;
    }
  }
  await audit(ctx, "DELETE", kind, id, `Deleted ${kind}`);
}

export async function setDefaultCompany(ctx: Ctx, id: string) {
  assertCan(ctx, "org.manage");
  const c = await prisma.company.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!c) throw new DomainError("Company not found.");
  await prisma.company.updateMany({ where: { tenantId: ctx.tenantId }, data: { isDefault: false } });
  await prisma.company.update({ where: { id }, data: { isDefault: true } });
}
