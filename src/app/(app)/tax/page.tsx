import type { Metadata } from "next";
import { Download } from "lucide-react";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { Badge, Callout, Card, CardHeader, Money, PageHeader, PersonCell, Select, Table, Tabs, TD, TH, THead, TR, btnClass } from "@/components/ui";
import { SalaryCalculator } from "@/components/salary-calculator";
import { EaFormView } from "@/components/ea-form-view";
import { PdfButton } from "@/components/pdf-button";
import { eaForm } from "@/server/services/tax.service";
import { tp1Total } from "@/server/services/payroll.service";
import { addDays, fmtDate, rm, todayMY } from "@/lib/utils";
import { FormModal } from "@/components/forms";
import { Field, Input } from "@/components/ui";
import { TP1_FIELDS } from "@/lib/tax-reliefs";
import { saveTaxDeclarationAction } from "../me/actions";

export const metadata: Metadata = { title: "Tax (LHDN)" };

export default async function TaxPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireCtx("tax.manage");
  const sp = await searchParams;
  const tab = sp.tab ?? "overview";
  const year = Number(sp.year ?? todayMY().getUTCFullYear());
  return (
    <>
      <PageHeader title="Income tax (LHDN)" emoji="🧮" subtitle="PCB/MTD, TP1 and TP3 declarations, Form EA, CP8D, and CP22 / CP22A notifications." />
      <Tabs
        active={tab}
        tabs={[
          { key: "overview", label: "Overview & notifications", href: "/tax?tab=overview" },
          { key: "ea", label: "Form EA / CP8D", href: "/tax?tab=ea" },
          { key: "declarations", label: "TP1 / TP3", href: "/tax?tab=declarations" },
          { key: "calculator", label: "Salary & PCB calculator", href: "/tax?tab=calculator" },
        ]}
      />
      {tab === "overview" && <Overview tenantId={ctx.tenantId} year={year} />}
      {tab === "ea" && <EaTab ctx={ctx} year={year} employeeId={sp.employee} />}
      {tab === "declarations" && <Declarations tenantId={ctx.tenantId} year={year} />}
      {tab === "calculator" && <SalaryCalculator />}
    </>
  );
}

async function Overview({ tenantId, year }: { tenantId: string; year: number }) {
  const today = todayMY();
  const [joiners, leavers, noTax] = await Promise.all([
    prisma.employee.findMany({ where: { tenantId, joinDate: { gte: addDays(today, -60) } }, orderBy: { joinDate: "desc" } }),
    prisma.separation.findMany({ where: { tenantId, status: { in: ["PENDING", "APPROVED"] } }, include: { employee: true } }),
    prisma.employee.findMany({ where: { tenantId, status: { in: ["ACTIVE", "PROBATION", "NOTICE"] }, taxNo: null, basicSalary: { gt: 3000 } } }),
  ]);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="CP22: new employees" emoji="🆕" subtitle="Notify LHDN within 30 days of commencement" />
        <Table>
          <THead>
            <tr>
              <TH>Employee</TH>
              <TH>Joined</TH>
              <TH>Due</TH>
            </tr>
          </THead>
          <tbody>
            {joiners.map((e) => {
              const due = addDays(e.joinDate, 30);
              return (
                <TR key={e.id}>
                  <TD><PersonCell name={e.fullName} sub={e.jobTitle} color={e.avatarColor} href={`/employees/${e.id}`} /></TD>
                  <TD className="text-xs">{fmtDate(e.joinDate)}</TD>
                  <TD><Badge tone={due < today ? "red" : "yellow"}>{fmtDate(due)}</Badge></TD>
                </TR>
              );
            })}
            {joiners.length === 0 && (
              <TR>
                <TD colSpan={3} className="text-sm text-muted">No recent joiners.</TD>
              </TR>
            )}
          </tbody>
        </Table>
      </Card>
      <Card>
        <CardHeader title="CP22A: leaving employees" emoji="👋" subtitle="Submit at least 30 days before the last day. Withhold final pay until LHDN clears." />
        <Table>
          <THead>
            <tr>
              <TH>Employee</TH>
              <TH>Last day</TH>
              <TH>CP22A</TH>
            </tr>
          </THead>
          <tbody>
            {leavers.map((s) => (
              <TR key={s.id}>
                <TD><PersonCell name={s.employee.fullName} sub={s.type.toLowerCase()} color={s.employee.avatarColor} /></TD>
                <TD className="text-xs">{fmtDate(s.lastWorkingDate)}</TD>
                <TD>{s.cp22aSubmitted ? <Badge tone="green">Submitted</Badge> : <Badge tone={addDays(s.lastWorkingDate, -30) < today ? "red" : "yellow"}>Due {fmtDate(addDays(s.lastWorkingDate, -30))}</Badge>}</TD>
              </TR>
            ))}
            {leavers.length === 0 && (
              <TR>
                <TD colSpan={3} className="text-sm text-muted">No pending separations.</TD>
              </TR>
            )}
          </tbody>
        </Table>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader title="Missing income tax numbers" emoji="🔎" subtitle="Employees likely above the tax threshold without a tax file number" />
        <div className="flex flex-wrap gap-2 p-5">
          {noTax.length === 0 ? <p className="text-sm text-muted">All good 👍</p> : noTax.map((e) => <Badge key={e.id} tone="yellow">{e.fullName}</Badge>)}
        </div>
      </Card>
      <div className="lg:col-span-2">
        <Callout emoji="📅">
          <b>Key dates for {year}:</b> PCB (CP39) by the 15th monthly · Form EA to employees by <b>28 Feb {year + 1}</b> · Form E + CP8D to LHDN by <b>31 Mar {year + 1}</b>.
        </Callout>
      </div>
    </div>
  );
}

async function EaTab({ ctx, year, employeeId }: { ctx: Awaited<ReturnType<typeof requireCtx>>; year: number; employeeId?: string }) {
  const [employees, companies] = await Promise.all([
    prisma.employee.findMany({ where: { tenantId: ctx.tenantId, payslips: { some: { period: { startsWith: `${year}-` } } } }, orderBy: { fullName: "asc" } }),
    prisma.company.findMany({ where: { tenantId: ctx.tenantId } }),
  ]);
  const selected = employeeId ?? employees[0]?.id;
  const ea = selected ? await eaForm(ctx, selected, year) : null;
  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-end gap-3">
        <form className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="tab" value="ea" />
          <Select name="employee" defaultValue={selected} options={employees.map((e) => ({ value: e.id, label: `${e.fullName} (${e.employeeNo})` }))} className="w-72" />
          <Select name="year" defaultValue={String(year)} options={["2025", "2026"]} className="w-28" />
          <button className={btnClass("primary")}>Show</button>
        </form>
        <div className="flex-1" />
        {companies.map((c) => (
          <a key={c.id} href={`/api/export/cp8d?companyId=${c.id}&year=${year}`} className={btnClass("secondary")}>
            <Download size={14} /> CP8D · {c.name.split(" ")[0]} {c.name.split(" ")[1] ?? ""}
          </a>
        ))}
        {selected && <PdfButton href={`/api/pdf/ea/${selected}?year=${year}`} label="Download Form EA" />}
      </div>
      {ea ? <EaFormView ea={ea} /> : <p className="text-sm text-muted">No payroll data for {year}.</p>}
    </div>
  );
}

function DeclarationFields({ d }: { d?: Record<string, unknown> | null }) {
  const v = (k: string) => (d && Number(d[k]) ? Number(d[k]) : "");
  return (
    <>
      <p className="text-xs font-bold uppercase text-muted">TP1 · additional reliefs (annual)</p>
      <div className="grid grid-cols-2 gap-3">
        {TP1_FIELDS.map(([k, label, cap]) => (
          <Field key={k} label={label} hint={`Max ${rm(cap, { decimals: 0 })}`}>
            <Input type="number" step="0.01" min={0} name={k} defaultValue={v(k)} />
          </Field>
        ))}
      </div>
      <p className="text-xs font-bold uppercase text-muted">TP3 · previous employer this year</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Gross remuneration"><Input type="number" step="0.01" name="prevGross" defaultValue={v("prevGross")} /></Field>
        <Field label="EPF"><Input type="number" step="0.01" name="prevEpf" defaultValue={v("prevEpf")} /></Field>
        <Field label="PCB"><Input type="number" step="0.01" name="prevPcb" defaultValue={v("prevPcb")} /></Field>
        <Field label="Zakat"><Input type="number" step="0.01" name="prevZakat" defaultValue={v("prevZakat")} /></Field>
      </div>
    </>
  );
}

async function Declarations({ tenantId, year }: { tenantId: string; year: number }) {
  const [rows, emps] = await Promise.all([
    prisma.taxDeclaration.findMany({ where: { year, employee: { tenantId } }, include: { employee: true } }),
    prisma.employee.findMany({ where: { tenantId, status: { in: ["ACTIVE", "PROBATION", "NOTICE"] } }, orderBy: { fullName: "asc" } }),
  ]);
  return (
    <Card>
      <CardHeader
        title={`Declarations ${year}`}
        emoji="🧾"
        subtitle="Employees submit these from Me → Tax & reliefs. HR can enter them from paper TP1/TP3 forms."
        action={
          <FormModal trigger="+ Enter declaration" triggerSize="sm" title="Enter TP1 / TP3 for an employee" action={saveTaxDeclarationAction} wide>
            <input type="hidden" name="year" value={year} />
            <Field label="Employee"><Select name="employeeId" options={emps.filter((e) => !rows.some((r) => r.employeeId === e.id)).map((e) => ({ value: e.id, label: `${e.fullName} (${e.employeeNo})` }))} /></Field>
            <DeclarationFields />
          </FormModal>
        }
      />
      <Table>
        <THead>
          <tr>
            <TH>Employee</TH>
            <TH className="text-right">TP1 reliefs</TH>
            <TH className="text-right">TP3 gross</TH>
            <TH className="text-right">TP3 PCB</TH>
            <TH>Updated</TH>
            <TH />
          </tr>
        </THead>
        <tbody>
          {rows.map((r) => (
            <TR key={r.id}>
              <TD><PersonCell name={r.employee.fullName} sub={r.employee.employeeNo} color={r.employee.avatarColor} /></TD>
              <TD className="text-right"><Money value={tp1Total(r as unknown as Record<string, unknown>)} /></TD>
              <TD className="text-right"><Money value={r.prevGross} /></TD>
              <TD className="text-right"><Money value={r.prevPcb} /></TD>
              <TD className="text-xs">{fmtDate(r.updatedAt)}</TD>
              <TD className="text-right">
                <FormModal trigger="Edit" triggerSize="sm" triggerVariant="secondary" title={`TP1 / TP3 · ${r.employee.fullName}`} action={saveTaxDeclarationAction} wide>
                  <input type="hidden" name="year" value={year} />
                  <input type="hidden" name="employeeId" value={r.employeeId} />
                  <DeclarationFields d={r as unknown as Record<string, unknown>} />
                </FormModal>
              </TD>
            </TR>
          ))}
          {rows.length === 0 && (
            <TR>
              <TD colSpan={6} className="text-sm text-muted">No declarations yet.</TD>
            </TR>
          )}
        </tbody>
      </Table>
      <p className="px-5 py-3 text-xs text-muted">Total TP1 reliefs are capped per category ({rm(2500, { decimals: 0 })} lifestyle, {rm(10000, { decimals: 0 })} medical and so on) before being applied to PCB.</p>
    </Card>
  );
}
