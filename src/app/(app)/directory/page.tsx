import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { Avatar, Card, EmptyState, Input, PageHeader, Select, btnClass } from "@/components/ui";
import type { Prisma } from "@prisma/client";

export const metadata: Metadata = { title: "Directory" };

/** Company directory for everyone: work details only (no personal phone, NRIC or pay). */
export default async function DirectoryPage({ searchParams }: { searchParams: Promise<{ q?: string; dept?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const where: Prisma.EmployeeWhereInput = { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROBATION", "NOTICE"] } };
  if (sp.dept) where.departmentId = sp.dept;
  if (sp.q) where.OR = [{ fullName: { contains: sp.q } }, { preferredName: { contains: sp.q } }, { jobTitle: { contains: sp.q } }];
  const [people, depts] = await Promise.all([
    prisma.employee.findMany({ where, include: { department: true, branch: true, manager: { select: { fullName: true } } }, orderBy: { fullName: "asc" } }),
    prisma.department.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Directory" emoji="📇" subtitle={`${people.length} colleagues. Find who does what and how to reach them.`} />
      <form className="mb-5 flex flex-wrap gap-2">
        <Input name="q" defaultValue={sp.q} placeholder="Search by name or role…" className="max-w-xs" />
        <Select name="dept" defaultValue={sp.dept ?? ""} placeholder="All departments" options={depts.map((d) => ({ value: d.id, label: d.name }))} className="w-52" />
        <button className={btnClass("primary")}>Search</button>
      </form>
      {people.length === 0 ? (
        <Card>
          <EmptyState emoji="🔍" title="No one found" />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {people.map((p) => (
            <div key={p.id} className="rounded-2xl border-2 border-ink bg-card p-4 shadow-brutal-sm" style={{ borderTopWidth: 6, borderTopColor: p.department?.color ?? "#16140F" }}>
              <div className="flex items-center gap-3">
                <Avatar name={p.fullName} color={p.avatarColor} size={44} />
                <div className="min-w-0">
                  <p className="truncate font-bold">{p.preferredName ?? p.fullName}</p>
                  <p className="truncate text-xs text-ink-2">{p.jobTitle}</p>
                </div>
              </div>
              <div className="mt-3 space-y-1 text-xs">
                <p className="truncate">🏢 {p.department?.name ?? "-"}</p>
                <p className="truncate">📍 {p.branch?.name ?? "-"}</p>
                {p.manager && <p className="truncate">🧭 Reports to {p.manager.fullName}</p>}
                <a href={`mailto:${p.email}`} className="block truncate font-semibold text-grape underline">
                  ✉️ {p.email}
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
