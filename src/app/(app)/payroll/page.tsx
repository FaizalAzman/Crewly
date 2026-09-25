import Link from "next/link";
import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { Card, CardHeader, Checkbox, EmptyState, Field, Input, Money, PageHeader, Select, StatCard, StatusBadge, Table, TD, TH, THead, TR } from "@/components/ui";
import { FormModal } from "@/components/forms";
import { TrendChart } from "@/components/charts";
import { periodLabel, periodOf, rm, shiftPeriod, todayMY } from "@/lib/utils";
import { MONTHS } from "@/lib/constants";
import { createRunAction } from "./actions";

export const metadata: Metadata = { title: "Payroll" };

export default async function PayrollPage() {
  const ctx = await requireCtx("payroll.manage");
  const [runs, companies, tenant] = await Promise.all([
    prisma.payrollRun.findMany({ where: { tenantId: ctx.tenantId }, include: { company: true }, orderBy: [{ period: "desc" }, { company: { name: "asc" } }] }),
    prisma.company.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { isDefault: "desc" } }),
    prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } }),
  ]);
  const current = periodOf(todayMY());
  const latestPeriod = runs[0]?.period;
  const nextPeriod = latestPeriod ? (runs.some((r) => r.period === latestPeriod && r.status === "DRAFT") ? latestPeriod : shiftPeriod(latestPeriod, 1)) : current;
  const latest = runs.filter((r) => r.period === latestPeriod);
  const byPeriod = new Map<string, { gross: number; cost: number }>();
  for (const r of runs) {
    const c = byPeriod.get(r.period) ?? { gross: 0, cost: 0 };
    c.gross += r.totalGross;
    c.cost += r.totalEmployerCost;
    byPeriod.set(r.period, c);
  }
  const trend = [...byPeriod.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([p, v]) => ({ label: `${MONTHS[+p.slice(5) - 1]}`, gross: Math.round(v.gross), cost: Math.round(v.cost) }));

  return (
    <>
      <PageHeader
        title="Payroll"
        emoji="💸"
        subtitle="Monthly payroll per legal entity: draft → calculate → approve (by a second person) → pay → lock."
        actions={
          <FormModal trigger="+ New payroll run" title="New payroll run" subtitle="Approved OT, claims, unpaid leave, loans and adjustments are pulled in automatically." action={createRunAction} submitLabel="Create run">
            <Field label="Legal entity">
              <Select name="companyId" options={companies.map((c) => ({ value: c.id, label: c.name }))} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Period">
                <Input type="month" name="period" defaultValue={nextPeriod} required />
              </Field>
              <Field label="Pay date">
                <Input type="date" name="payDate" defaultValue={`${nextPeriod}-${String(tenant.payDay).padStart(2, "0")}`} required />
              </Field>
            </div>
            <Field label="Notes">
              <Input name="notes" placeholder="Optional" />
            </Field>
            <Checkbox name="calculate" label="Calculate immediately" defaultChecked />
          </FormModal>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={latestPeriod ? `Gross · ${periodLabel(latestPeriod)}` : "Gross"} value={rm(latest.reduce((s, r) => s + r.totalGross, 0), { decimals: 0 })} tone="lime" emoji="💰" />
        <StatCard label="Net pay" value={rm(latest.reduce((s, r) => s + r.totalNet, 0), { decimals: 0 })} tone="sky" emoji="🏦" />
        <StatCard label="Employer cost" value={rm(latest.reduce((s, r) => s + r.totalEmployerCost, 0), { decimals: 0 })} tone="sunny" emoji="🧾" />
        <StatCard label="Headcount paid" value={latest.reduce((s, r) => s + r.headcount, 0)} tone="bubblegum" emoji="🧑‍🤝‍🧑" />
      </div>

      {trend.length > 1 && (
        <Card className="mb-6">
          <CardHeader title="Gross pay vs total employer cost" emoji="📈" subtitle="Employer cost = gross + EPF, SOCSO, EIS employer shares + HRD Corp levy" />
          <div className="p-4">
            <TrendChart money data={trend} series={[{ key: "gross", label: "Gross pay" }, { key: "cost", label: "Employer cost" }]} height={240} />
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Payroll runs" emoji="🗂️" />
        {runs.length === 0 ? (
          <EmptyState emoji="💸" title="No payroll runs yet" body="Create your first run to calculate salaries and statutory contributions." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Period</TH>
                <TH>Entity</TH>
                <TH>Status</TH>
                <TH className="text-right">Staff</TH>
                <TH className="text-right">Gross</TH>
                <TH className="text-right">EPF (EE+ER)</TH>
                <TH className="text-right">PCB</TH>
                <TH className="text-right">Net</TH>
                <TH>Pay date</TH>
              </tr>
            </THead>
            <tbody>
              {runs.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link href={`/payroll/${r.id}`} className="font-bold underline decoration-2 underline-offset-2">
                      {periodLabel(r.period)}
                    </Link>
                  </TD>
                  <TD className="text-xs">{r.company.name}</TD>
                  <TD>
                    <StatusBadge status={r.status} />
                  </TD>
                  <TD className="text-right">{r.headcount}</TD>
                  <TD className="text-right"><Money value={r.totalGross} /></TD>
                  <TD className="text-right"><Money value={r.totalEpfEE + r.totalEpfER} /></TD>
                  <TD className="text-right"><Money value={r.totalPcb} /></TD>
                  <TD className="text-right font-bold"><Money value={r.totalNet} /></TD>
                  <TD className="text-xs">{r.payDate.toISOString().slice(0, 10)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
