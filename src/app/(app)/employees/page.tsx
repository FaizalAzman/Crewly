import Link from "next/link";
import type { Metadata } from "next";
import { Download, Plus } from "lucide-react";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { Badge, Card, EmptyState, Input, LinkButton, PageHeader, PersonCell, Select, StatusBadge, Table, TD, TH, THead, TR, btnClass } from "@/components/ui";
import { fmtDate, rm } from "@/lib/utils";
import { can } from "@/lib/permissions";
import { EMPLOYEE_STATUS, humanize } from "@/lib/constants";
import type { Prisma } from "@prisma/client";

export const metadata: Metadata = { title: "Employees" };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireCtx("employee.view");
  const sp = await searchParams;
  const status = sp.status ?? "CURRENT";
  const where: Prisma.EmployeeWhereInput = { tenantId: ctx.tenantId };
  if (status === "CURRENT") where.status = { in: ["ACTIVE", "PROBATION", "NOTICE"] };
  else if (status !== "ALL") where.status = status;
  if (sp.dept) where.departmentId = sp.dept;
  if (sp.company) where.companyId = sp.company;
  if (sp.type) where.employmentType = sp.type;
  if (sp.q) {
    where.OR = [{ fullName: { contains: sp.q } }, { employeeNo: { contains: sp.q } }, { email: { contains: sp.q } }, { jobTitle: { contains: sp.q } }, { icNo: { contains: sp.q } }];
  }
  if (ctx.role === "MANAGER" && ctx.employeeId) {
    where.AND = [{ OR: [{ managerId: ctx.employeeId }, { manager: { managerId: ctx.employeeId } }, { id: ctx.employeeId }] }];
  }

  const [employees, depts, companies, counts] = await Promise.all([
    prisma.employee.findMany({ where, include: { department: true, company: true, branch: true, manager: { select: { fullName: true } } }, orderBy: { employeeNo: "asc" } }),
    prisma.department.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { name: "asc" } }),
    prisma.company.findMany({ where: { tenantId: ctx.tenantId } }),
    prisma.employee.groupBy({ by: ["status"], where: { tenantId: ctx.tenantId }, _count: true }),
  ]);
  const sensitive = can(ctx.role, "employee.sensitive");
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader
        title="Employees"
        emoji="🧑‍🤝‍🧑"
        subtitle="Everyone in your company, their records and their details."
        actions={
          <>
            {sensitive && (
              <a href={`/api/export/employees?${qs}`} className={btnClass("secondary")}>
                <Download size={15} /> Export CSV
              </a>
            )}
            {can(ctx.role, "employee.manage") && (
              <LinkButton href="/employees/new">
                <Plus size={15} /> Add employee
              </LinkButton>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {[
          ["CURRENT", "Current", count("ACTIVE") + count("PROBATION") + count("NOTICE")],
          ["ACTIVE", "Active", count("ACTIVE")],
          ["PROBATION", "Probation", count("PROBATION")],
          ["NOTICE", "Serving notice", count("NOTICE")],
          ["RESIGNED", "Former", count("RESIGNED") + count("TERMINATED") + count("RETIRED")],
          ["ALL", "All", counts.reduce((s, c) => s + c._count, 0)],
        ].map(([key, label, n]) => (
          <Link
            key={key}
            href={`/employees?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)), status: String(key) } as Record<string, string>)}`}
            className={`rounded-full border-2 border-ink px-3 py-1 text-xs font-bold ${status === key ? "bg-ink text-paper" : "bg-card hover:bg-paper-2"}`}
          >
            {label} <span className="opacity-60">{n}</span>
          </Link>
        ))}
      </div>

      <Card>
        <form className="flex flex-wrap items-end gap-3 border-b-2 border-ink p-4">
          <input type="hidden" name="status" value={status} />
          <div className="min-w-[220px] flex-1">
            <Input name="q" defaultValue={sp.q} placeholder="Search name, ID, email, NRIC, title…" />
          </div>
          <Select name="dept" defaultValue={sp.dept ?? ""} placeholder="All departments" options={depts.map((d) => ({ value: d.id, label: d.name }))} className="w-48" />
          {companies.length > 1 && <Select name="company" defaultValue={sp.company ?? ""} placeholder="All entities" options={companies.map((c) => ({ value: c.id, label: c.name }))} className="w-56" />}
          <Select name="type" defaultValue={sp.type ?? ""} placeholder="All types" options={["PERMANENT", "CONTRACT", "PROBATION", "INTERN", "PART_TIME"]} className="w-40" />
          <button className={btnClass("primary")}>Filter</button>
        </form>
        {employees.length === 0 ? (
          <EmptyState emoji="🔍" title="No one matches" body="Try a different search or filter." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Employee</TH>
                <TH>ID</TH>
                <TH>Department</TH>
                <TH>Location</TH>
                <TH>Type</TH>
                <TH>Joined</TH>
                {sensitive && <TH className="text-right">Basic</TH>}
                <TH>Status</TH>
              </tr>
            </THead>
            <tbody>
              {employees.map((e) => (
                <TR key={e.id}>
                  <TD>
                    <PersonCell name={e.fullName} sub={e.jobTitle} color={e.avatarColor} href={`/employees/${e.id}`} />
                  </TD>
                  <TD className="font-mono text-xs">{e.employeeNo}</TD>
                  <TD>
                    {e.department ? (
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <span className="h-2.5 w-2.5 rounded-full border border-ink" style={{ background: e.department.color }} />
                        {e.department.name}
                      </span>
                    ) : (
                      "-"
                    )}
                  </TD>
                  <TD className="text-xs text-ink-2">
                    {e.branch?.name ?? "-"}
                    {companies.length > 1 && <span className="block text-[10px] text-muted">{e.company.name}</span>}
                  </TD>
                  <TD>
                    <span className="text-xs">{humanize(e.employmentType)}</span>
                    {e.citizenship === "FOREIGNER" && <Badge tone="blue" className="ml-1">🌏</Badge>}
                  </TD>
                  <TD className="text-xs">{fmtDate(e.joinDate)}</TD>
                  {sensitive && <TD className="text-right font-mono text-xs">{rm(e.basicSalary, { decimals: 0 })}</TD>}
                  <TD>
                    <StatusBadge status={e.status} />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted">
        Showing {employees.length} {employees.length === 1 ? "person" : "people"} · Statuses: {EMPLOYEE_STATUS.map(humanize).join(", ")}
      </p>
    </>
  );
}
