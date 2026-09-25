import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { Badge, Callout, Card, CardHeader, Field, Input, Money, PageHeader, PersonCell, Select, StatCard, StatusBadge, Table, Tabs, TD, TH, THead, TR, Textarea } from "@/components/ui";
import { FormModal } from "@/components/forms";
import { DecideButtons } from "@/components/decide-buttons";
import { DistributionChart } from "@/components/charts";
import { act } from "@/server/action";
import { proposeCompensation, compaRatio } from "@/server/services/money.service";
import { dateField, fmtDate, numField, optStr, rm, str, todayMY } from "@/lib/utils";
import { humanize } from "@/lib/constants";
import type { ActionState } from "@/server/types";
import { revalidatePath } from "next/cache";

export const metadata: Metadata = { title: "Compensation" };

async function proposeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("compensation.manage");
  return act(async () => {
    const { warnings } = await proposeCompensation(ctx, {
      employeeId: str(fd, "employeeId"),
      type: str(fd, "type") as "INCREMENT",
      effectiveDate: dateField(fd, "effectiveDate") ?? todayMY(),
      newSalary: str(fd, "newSalary") ? numField(fd, "newSalary") : undefined,
      bonusAmount: str(fd, "bonusAmount") ? numField(fd, "bonusAmount") : undefined,
      newTitle: optStr(fd, "newTitle") ?? undefined,
      reason: optStr(fd, "reason") ?? undefined,
    });
    revalidatePath("/compensation");
    return `Proposal submitted for approval${warnings.length ? ` · ${warnings.join(" ")}` : ""}`;
  });
}

export default async function CompensationPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requireCtx("compensation.manage");
  const tab = (await searchParams).tab ?? "changes";
  const [changes, emps] = await Promise.all([
    prisma.compensationChange.findMany({ where: { tenantId: ctx.tenantId }, include: { employee: true }, orderBy: { createdAt: "desc" } }),
    prisma.employee.findMany({ where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROBATION", "NOTICE"] } }, include: { grade: true, department: true }, orderBy: { fullName: "asc" } }),
  ]);
  const withGrade = emps.filter((e) => e.grade);
  const buckets = [
    { name: "< 0.8", test: (c: number) => c < 0.8 },
    { name: "0.8–0.9", test: (c: number) => c >= 0.8 && c < 0.9 },
    { name: "0.9–1.0", test: (c: number) => c >= 0.9 && c < 1 },
    { name: "1.0–1.1", test: (c: number) => c >= 1 && c < 1.1 },
    { name: "1.1–1.2", test: (c: number) => c >= 1.1 && c < 1.2 },
    { name: "≥ 1.2", test: (c: number) => c >= 1.2 },
  ].map((b) => ({ name: b.name, value: withGrade.filter((e) => b.test(compaRatio(e.basicSalary, e.grade!.midSalary))).length, highlight: b.name === "≥ 1.2" || b.name === "< 0.8" }));
  const payroll = emps.reduce((s, e) => s + e.basicSalary, 0);
  const outOfBand = withGrade.filter((e) => e.basicSalary > e.grade!.maxSalary || e.basicSalary < e.grade!.minSalary);

  return (
    <>
      <PageHeader
        title="Compensation"
        emoji="📈"
        subtitle="Increments, promotions and bonuses, with salary bands and compa-ratios."
        actions={
          <FormModal trigger="+ Propose change" title="Propose a compensation change" subtitle="Applies after approval. Bonuses are paid in the payroll month of the effective date." action={proposeAction}>
            <Field label="Employee">
              <Select name="employeeId" options={emps.map((e) => ({ value: e.id, label: `${e.fullName} · ${rm(e.basicSalary, { decimals: 0 })}` }))} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <Select name="type" options={["INCREMENT", "PROMOTION", "ADJUSTMENT", "BONUS"]} />
              </Field>
              <Field label="Effective date">
                <Input type="date" name="effectiveDate" required />
              </Field>
              <Field label="New basic salary">
                <Input type="number" step="0.01" name="newSalary" />
              </Field>
              <Field label="Bonus amount">
                <Input type="number" step="0.01" name="bonusAmount" />
              </Field>
            </div>
            <Field label="New job title (promotion)">
              <Input name="newTitle" />
            </Field>
            <Field label="Reason">
              <Textarea name="reason" />
            </Field>
          </FormModal>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Monthly basic payroll" value={rm(payroll, { decimals: 0 })} tone="lime" emoji="💰" />
        <StatCard label="Pending proposals" value={changes.filter((c) => c.status === "PENDING").length} tone="sunny" emoji="⏳" />
        <StatCard label="Outside salary band" value={outOfBand.length} tone="bubblegum" emoji="🎯" />
        <StatCard label="Avg compa-ratio" value={withGrade.length ? (withGrade.reduce((s, e) => s + compaRatio(e.basicSalary, e.grade!.midSalary), 0) / withGrade.length).toFixed(2) : "-"} tone="sky" emoji="⚖️" />
      </div>
      <Tabs active={tab} tabs={[{ key: "changes", label: "Changes", href: "/compensation?tab=changes" }, { key: "bands", label: "Band analysis", href: "/compensation?tab=bands" }]} />
      {tab === "changes" ? (
        <Card>
          <Table>
            <THead>
              <tr>
                <TH>Employee</TH>
                <TH>Type</TH>
                <TH>Effective</TH>
                <TH className="text-right">Change</TH>
                <TH>Reason</TH>
                <TH>Status</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {changes.map((c) => {
                const pct = c.oldSalary ? ((c.newSalary - c.oldSalary) / c.oldSalary) * 100 : 0;
                return (
                  <TR key={c.id}>
                    <TD><PersonCell name={c.employee.fullName} sub={c.newTitle ? `→ ${c.newTitle}` : c.employee.jobTitle} color={c.employee.avatarColor} /></TD>
                    <TD><Badge tone="purple">{humanize(c.type)}</Badge></TD>
                    <TD className="text-xs">{fmtDate(c.effectiveDate)}</TD>
                    <TD className="text-right font-mono text-xs">
                      {c.type === "BONUS" ? rm(c.bonusAmount) : (
                        <>
                          {rm(c.oldSalary, { decimals: 0 })} → {rm(c.newSalary, { decimals: 0 })} <Badge tone={pct > 0 ? "green" : "red"}>{pct > 0 ? "+" : ""}{pct.toFixed(1)}%</Badge>
                        </>
                      )}
                    </TD>
                    <TD className="max-w-xs text-xs">{c.reason}</TD>
                    <TD><StatusBadge status={c.status} /></TD>
                    <TD>{c.status === "PENDING" && <DecideButtons kind="compensation" id={c.id} requireReason={false} />}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader title="Compa-ratio distribution" emoji="📊" subtitle="Salary ÷ grade midpoint. Outliers highlighted." />
            <div className="p-4">
              <DistributionChart data={buckets} />
            </div>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader title="Employees vs band" emoji="🎯" />
            <Table>
              <THead>
                <tr>
                  <TH>Employee</TH>
                  <TH>Grade</TH>
                  <TH className="text-right">Basic</TH>
                  <TH className="text-right">Band</TH>
                  <TH className="text-right">CR</TH>
                </tr>
              </THead>
              <tbody>
                {withGrade.map((e) => {
                  const cr = compaRatio(e.basicSalary, e.grade!.midSalary);
                  return (
                    <TR key={e.id}>
                      <TD><PersonCell name={e.fullName} sub={e.department?.name} color={e.avatarColor} /></TD>
                      <TD className="text-xs">{e.grade!.code}</TD>
                      <TD className="text-right"><Money value={e.basicSalary} /></TD>
                      <TD className="text-right font-mono text-xs">{rm(e.grade!.minSalary, { decimals: 0 })}–{rm(e.grade!.maxSalary, { decimals: 0 })}</TD>
                      <TD className="text-right"><Badge tone={cr >= 1.2 || cr < 0.8 ? "orange" : "gray"}>{cr.toFixed(2)}</Badge></TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </Card>
          {outOfBand.length > 0 && (
            <div className="lg:col-span-3">
              <Callout emoji="🎯">Outside band: {outOfBand.map((e) => e.fullName).join(", ")}. Consider re-grading or adjusting the band.</Callout>
            </div>
          )}
        </div>
      )}
    </>
  );
}
