import Link from "next/link";
import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { Avatar, Badge, Card, CardBody, CardHeader, Checkbox, Field, Input, KV, Money, PageHeader, Select, StatCard, Table, Tabs, TD, TH, THead, TR } from "@/components/ui";
import { FormModal } from "@/components/forms";
import { STATES, stateName } from "@/lib/constants";
import { saveBranchAction, saveCompanyAction, saveDepartmentAction, saveGradeAction, savePositionAction } from "./actions";

export const metadata: Metadata = { title: "Organization" };

export default async function OrgPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requireCtx("org.manage");
  const tab = (await searchParams).tab ?? "entities";
  const T = ctx.tenantId;
  const [companies, branches, depts, positions, grades, employees] = await Promise.all([
    prisma.company.findMany({ where: { tenantId: T }, include: { _count: { select: { employees: true, branches: true } } }, orderBy: { isDefault: "desc" } }),
    prisma.branch.findMany({ where: { tenantId: T }, include: { company: true, _count: { select: { employees: true } } } }),
    prisma.department.findMany({ where: { tenantId: T }, include: { parent: true, _count: { select: { employees: true } } }, orderBy: { name: "asc" } }),
    prisma.position.findMany({ where: { tenantId: T }, include: { department: true, grade: true, _count: { select: { employees: true } } }, orderBy: { title: "asc" } }),
    prisma.jobGrade.findMany({ where: { tenantId: T }, include: { _count: { select: { employees: true } } }, orderBy: { code: "asc" } }),
    prisma.employee.findMany({ where: { tenantId: T, status: { in: ["ACTIVE", "PROBATION", "NOTICE"] } }, select: { id: true, fullName: true, jobTitle: true, managerId: true, avatarColor: true, departmentId: true, basicSalary: true, gradeId: true } }),
  ]);
  const empName = (id: string | null) => employees.find((e) => e.id === id)?.fullName ?? "-";
  const empOpts = employees.map((e) => ({ value: e.id, label: e.fullName }));
  const stateOpts = STATES.map((s) => ({ value: s.code, label: s.name }));

  return (
    <>
      <PageHeader title="Organization" emoji="🏢" subtitle="Legal entities, locations, departments, positions and salary bands." />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatCard label="Legal entities" value={companies.length} tone="lime" emoji="🏛️" />
        <StatCard label="Branches" value={branches.length} tone="sky" emoji="📍" />
        <StatCard label="Departments" value={depts.length} tone="bubblegum" emoji="🧩" />
        <StatCard label="Positions" value={positions.length} tone="sunny" emoji="💼" />
        <StatCard label="Grades" value={grades.length} tone="white" emoji="🪜" />
      </div>
      <Tabs
        active={tab}
        tabs={["entities", "branches", "departments", "positions", "grades", "chart"].map((t) => ({ key: t, label: t === "chart" ? "Org chart" : t[0].toUpperCase() + t.slice(1), href: `/org?tab=${t}` }))}
      />

      {tab === "entities" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <FormModal trigger="+ Legal entity" title="New legal entity" action={saveCompanyAction} wide>
              <CompanyFields stateOpts={stateOpts} />
            </FormModal>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            {companies.map((c) => (
              <Card key={c.id}>
                <CardHeader
                  title={c.name}
                  emoji="🏛️"
                  subtitle={c.regNo ?? "No SSM number"}
                  action={
                    <FormModal trigger="Edit" triggerSize="sm" triggerVariant="secondary" title={`Edit ${c.name}`} action={saveCompanyAction} wide>
                      <input type="hidden" name="id" value={c.id} />
                      <CompanyFields c={c} stateOpts={stateOpts} />
                    </FormModal>
                  }
                />
                <CardBody>
                  <dl className="grid grid-cols-2 gap-4">
                    <KV label="KWSP employer no." value={c.epfNo} mono />
                    <KV label="PERKESO employer code" value={c.socsoNo} mono />
                    <KV label="LHDN employer no. (E)" value={c.taxNo} mono />
                    <KV label="HRD Corp MyCoID" value={c.hrdfNo} mono />
                    <KV label="State" value={stateName(c.state)} />
                    <KV label="Headcount" value={`${c._count.employees} people · ${c._count.branches} branches`} />
                  </dl>
                  <p className="mt-3 text-xs text-muted">{c.address}</p>
                  {c.isDefault && <Badge tone="lime" className="mt-2">Default entity</Badge>}
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      )}

      {tab === "branches" && (
        <Card>
          <CardHeader
            title="Branches & work locations"
            emoji="📍"
            subtitle="The branch state decides which public holidays apply. Coordinates enable the clock-in geofence."
            action={
              <FormModal trigger="+ Branch" triggerSize="sm" title="New branch" action={saveBranchAction}>
                <BranchFields companies={companies} stateOpts={stateOpts} />
              </FormModal>
            }
          />
          <Table>
            <THead>
              <tr>
                <TH>Branch</TH>
                <TH>Entity</TH>
                <TH>State</TH>
                <TH>Geofence</TH>
                <TH>Staff</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {branches.map((b) => (
                <TR key={b.id}>
                  <TD className="font-semibold">
                    {b.name}
                    <span className="block text-xs text-muted">{b.address}</span>
                  </TD>
                  <TD className="text-xs">{b.company.name}</TD>
                  <TD>{stateName(b.state)}</TD>
                  <TD className="text-xs">{b.latitude != null ? `${b.geofenceMeters}m · ${b.latitude.toFixed(4)}, ${b.longitude?.toFixed(4)}` : <Badge tone="gray">Off</Badge>}</TD>
                  <TD>{b._count.employees}</TD>
                  <TD className="text-right">
                    <FormModal trigger="Edit" triggerSize="sm" triggerVariant="secondary" title={`Edit ${b.name}`} action={saveBranchAction}>
                      <input type="hidden" name="id" value={b.id} />
                      <BranchFields b={b} companies={companies} stateOpts={stateOpts} />
                    </FormModal>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {tab === "departments" && (
        <Card>
          <CardHeader
            title="Departments"
            emoji="🧩"
            action={
              <FormModal trigger="+ Department" triggerSize="sm" title="New department" action={saveDepartmentAction}>
                <DeptFields depts={depts} empOpts={empOpts} />
              </FormModal>
            }
          />
          <Table>
            <THead>
              <tr>
                <TH>Department</TH>
                <TH>Code</TH>
                <TH>Cost centre</TH>
                <TH>Parent</TH>
                <TH>Head</TH>
                <TH>Staff</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {depts.map((d) => (
                <TR key={d.id}>
                  <TD>
                    <span className="inline-flex items-center gap-2 font-semibold">
                      <span className="h-3 w-3 rounded-full border border-ink" style={{ background: d.color }} />
                      {d.name}
                    </span>
                  </TD>
                  <TD className="font-mono text-xs">{d.code}</TD>
                  <TD className="font-mono text-xs">{d.costCenter}</TD>
                  <TD className="text-xs">{d.parent?.name ?? "-"}</TD>
                  <TD className="text-xs">{empName(d.headId)}</TD>
                  <TD>
                    <Link href={`/employees?dept=${d.id}`} className="font-bold underline">
                      {d._count.employees}
                    </Link>
                  </TD>
                  <TD className="text-right">
                    <FormModal trigger="Edit" triggerSize="sm" triggerVariant="secondary" title={`Edit ${d.name}`} action={saveDepartmentAction}>
                      <input type="hidden" name="id" value={d.id} />
                      <DeptFields d={d} depts={depts} empOpts={empOpts} />
                    </FormModal>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {tab === "positions" && (
        <Card>
          <CardHeader
            title="Positions"
            emoji="💼"
            subtitle="Budgeted headcount vs filled"
            action={
              <FormModal trigger="+ Position" triggerSize="sm" title="New position" action={savePositionAction}>
                <PositionFields depts={depts} grades={grades} />
              </FormModal>
            }
          />
          <Table>
            <THead>
              <tr>
                <TH>Title</TH>
                <TH>Department</TH>
                <TH>Grade</TH>
                <TH>Filled / budget</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {positions.map((p) => (
                <TR key={p.id}>
                  <TD className="font-semibold">{p.title}</TD>
                  <TD className="text-xs">{p.department?.name ?? "-"}</TD>
                  <TD className="text-xs">{p.grade?.code ?? "-"}</TD>
                  <TD>
                    <Badge tone={p._count.employees > p.headcount ? "red" : p._count.employees < p.headcount ? "yellow" : "green"}>
                      {p._count.employees} / {p.headcount}
                    </Badge>
                  </TD>
                  <TD className="text-right">
                    <FormModal trigger="Edit" triggerSize="sm" triggerVariant="secondary" title={`Edit ${p.title}`} action={savePositionAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <PositionFields p={p} depts={depts} grades={grades} />
                    </FormModal>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {tab === "grades" && (
        <Card>
          <CardHeader
            title="Job grades & salary bands"
            emoji="🪜"
            action={
              <FormModal trigger="+ Grade" triggerSize="sm" title="New grade" action={saveGradeAction}>
                <GradeFields />
              </FormModal>
            }
          />
          <Table>
            <THead>
              <tr>
                <TH>Grade</TH>
                <TH className="text-right">Min</TH>
                <TH className="text-right">Mid</TH>
                <TH className="text-right">Max</TH>
                <TH>People</TH>
                <TH>Avg compa-ratio</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {grades.map((g) => {
                const inGrade = employees.filter((e) => e.gradeId === g.id);
                const cr = inGrade.length ? inGrade.reduce((s, e) => s + e.basicSalary / g.midSalary, 0) / inGrade.length : 0;
                return (
                  <TR key={g.id}>
                    <TD className="font-semibold">
                      {g.code} · {g.name}
                    </TD>
                    <TD className="text-right"><Money value={g.minSalary} /></TD>
                    <TD className="text-right"><Money value={g.midSalary} /></TD>
                    <TD className="text-right"><Money value={g.maxSalary} /></TD>
                    <TD>{g._count.employees}</TD>
                    <TD>{cr ? <Badge tone={cr > 1.1 ? "orange" : cr < 0.9 ? "blue" : "green"}>{cr.toFixed(2)}</Badge> : "-"}</TD>
                    <TD className="text-right">
                      <FormModal trigger="Edit" triggerSize="sm" triggerVariant="secondary" title={`Edit ${g.code}`} action={saveGradeAction}>
                        <input type="hidden" name="id" value={g.id} />
                        <GradeFields g={g} />
                      </FormModal>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}

      {tab === "chart" && <OrgChart employees={employees} depts={depts} />}
    </>
  );
}

type Emp = { id: string; fullName: string; jobTitle: string; managerId: string | null; avatarColor: string; departmentId: string | null };

function OrgChart({ employees, depts }: { employees: Emp[]; depts: { id: string; color: string; name: string }[] }) {
  const roots = employees.filter((e) => !e.managerId || !employees.some((m) => m.id === e.managerId));
  const color = (id: string | null) => depts.find((d) => d.id === id)?.color ?? "#E9DCC4";
  const Node = ({ e, depth }: { e: Emp; depth: number }) => {
    const kids = employees.filter((c) => c.managerId === e.id);
    return (
      <li className="relative">
        <Link href={`/employees/${e.id}`} className="press inline-flex items-center gap-2 rounded-xl border-2 border-ink bg-card py-1.5 pl-1.5 pr-3 shadow-brutal-sm" style={{ borderLeftWidth: 6, borderLeftColor: color(e.departmentId) }}>
          <Avatar name={e.fullName} color={e.avatarColor} size={28} />
          <span>
            <span className="block text-sm font-bold leading-tight">{e.fullName}</span>
            <span className="block text-[11px] text-muted">
              {e.jobTitle}
              {kids.length > 0 && ` · ${kids.length} report${kids.length > 1 ? "s" : ""}`}
            </span>
          </span>
        </Link>
        {kids.length > 0 && depth < 6 && (
          <ul className="ml-6 mt-2 space-y-2 border-l-2 border-dashed border-ink pl-5">
            {kids.map((k) => (
              <Node key={k.id} e={k} depth={depth + 1} />
            ))}
          </ul>
        )}
      </li>
    );
  };
  return (
    <Card>
      <CardHeader title="Org chart" emoji="🌳" subtitle="Reporting lines. The coloured edge shows the department." />
      <CardBody className="overflow-x-auto">
        <ul className="space-y-3">
          {roots.map((r) => (
            <Node key={r.id} e={r} depth={0} />
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-2">
          {depts.map((d) => (
            <span key={d.id} className="inline-flex items-center gap-1.5 text-xs font-semibold">
              <span className="h-3 w-3 rounded border border-ink" style={{ background: d.color }} />
              {d.name}
            </span>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

function CompanyFields({ c, stateOpts }: { c?: { name: string; regNo: string | null; epfNo: string | null; socsoNo: string | null; taxNo: string | null; hrdfNo: string | null; hrdfOptIn: boolean; address: string | null; state: string; phone: string | null }; stateOpts: { value: string; label: string }[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Company name" className="md:col-span-2">
        <Input name="name" defaultValue={c?.name} required />
      </Field>
      <Field label="SSM registration no.">
        <Input name="regNo" defaultValue={c?.regNo ?? ""} placeholder="202001012345 (1234567-A)" />
      </Field>
      <Field label="Phone">
        <Input name="phone" defaultValue={c?.phone ?? ""} />
      </Field>
      <Field label="KWSP employer no.">
        <Input name="epfNo" defaultValue={c?.epfNo ?? ""} />
      </Field>
      <Field label="PERKESO employer code">
        <Input name="socsoNo" defaultValue={c?.socsoNo ?? ""} />
      </Field>
      <Field label="LHDN employer no. (E)">
        <Input name="taxNo" defaultValue={c?.taxNo ?? ""} placeholder="E 1234567890" />
      </Field>
      <Field label="HRD Corp MyCoID">
        <Input name="hrdfNo" defaultValue={c?.hrdfNo ?? ""} />
      </Field>
      <Field label="Address" className="md:col-span-2">
        <Input name="address" defaultValue={c?.address ?? ""} />
      </Field>
      <Field label="State">
        <Select name="state" defaultValue={c?.state ?? "SELANGOR"} options={stateOpts} />
      </Field>
      <div className="flex items-end pb-2">
        <Checkbox name="hrdfOptIn" label="Registered with HRD Corp voluntarily (5–9 staff, 0.5%)" defaultChecked={c?.hrdfOptIn} />
      </div>
    </div>
  );
}

function BranchFields({ b, companies, stateOpts }: { b?: { name: string; companyId: string; state: string; address: string | null; latitude: number | null; longitude: number | null; geofenceMeters: number }; companies: { id: string; name: string }[]; stateOpts: { value: string; label: string }[] }) {
  return (
    <>
      <Field label="Branch name">
        <Input name="name" defaultValue={b?.name} required />
      </Field>
      <Field label="Legal entity">
        <Select name="companyId" defaultValue={b?.companyId} options={companies.map((c) => ({ value: c.id, label: c.name }))} />
      </Field>
      <Field label="State (for public holidays)">
        <Select name="state" defaultValue={b?.state ?? "SELANGOR"} options={stateOpts} />
      </Field>
      <Field label="Address">
        <Input name="address" defaultValue={b?.address ?? ""} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Latitude">
          <Input name="latitude" type="number" step="any" defaultValue={b?.latitude ?? ""} />
        </Field>
        <Field label="Longitude">
          <Input name="longitude" type="number" step="any" defaultValue={b?.longitude ?? ""} />
        </Field>
        <Field label="Radius (m)">
          <Input name="geofenceMeters" type="number" defaultValue={b?.geofenceMeters ?? 200} />
        </Field>
      </div>
    </>
  );
}

function DeptFields({ d, depts, empOpts }: { d?: { id: string; name: string; code: string; costCenter: string | null; color: string; parentId: string | null; headId: string | null }; depts: { id: string; name: string }[]; empOpts: { value: string; label: string }[] }) {
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Name" className="col-span-2">
          <Input name="name" defaultValue={d?.name} required />
        </Field>
        <Field label="Code">
          <Input name="code" defaultValue={d?.code} required />
        </Field>
        <Field label="Cost centre">
          <Input name="costCenter" defaultValue={d?.costCenter ?? ""} />
        </Field>
        <Field label="Colour">
          <Input name="color" type="color" defaultValue={d?.color ?? "#7C5CFF"} className="p-1" />
        </Field>
      </div>
      <Field label="Parent department">
        <Select name="parentId" defaultValue={d?.parentId ?? ""} placeholder="— None —" options={depts.filter((x) => x.id !== d?.id).map((x) => ({ value: x.id, label: x.name }))} />
      </Field>
      <Field label="Head of department">
        <Select name="headId" defaultValue={d?.headId ?? ""} placeholder="—" options={empOpts} />
      </Field>
    </>
  );
}

function PositionFields({ p, depts, grades }: { p?: { title: string; departmentId: string | null; gradeId: string | null; headcount: number }; depts: { id: string; name: string }[]; grades: { id: string; code: string; name: string }[] }) {
  return (
    <>
      <Field label="Title">
        <Input name="title" defaultValue={p?.title} required />
      </Field>
      <Field label="Department">
        <Select name="departmentId" defaultValue={p?.departmentId ?? ""} placeholder="—" options={depts.map((d) => ({ value: d.id, label: d.name }))} />
      </Field>
      <Field label="Grade">
        <Select name="gradeId" defaultValue={p?.gradeId ?? ""} placeholder="—" options={grades.map((g) => ({ value: g.id, label: `${g.code} · ${g.name}` }))} />
      </Field>
      <Field label="Budgeted headcount">
        <Input name="headcount" type="number" min={0} defaultValue={p?.headcount ?? 1} />
      </Field>
    </>
  );
}

function GradeFields({ g }: { g?: { code: string; name: string; minSalary: number; midSalary: number; maxSalary: number } }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Code">
        <Input name="code" defaultValue={g?.code} required />
      </Field>
      <Field label="Name">
        <Input name="name" defaultValue={g?.name} required />
      </Field>
      <Field label="Minimum (RM)">
        <Input name="minSalary" type="number" defaultValue={g?.minSalary} required />
      </Field>
      <Field label="Midpoint (RM)">
        <Input name="midSalary" type="number" defaultValue={g?.midSalary} required />
      </Field>
      <Field label="Maximum (RM)">
        <Input name="maxSalary" type="number" defaultValue={g?.maxSalary} required />
      </Field>
    </div>
  );
}
