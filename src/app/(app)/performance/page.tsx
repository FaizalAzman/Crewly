import Link from "next/link";
import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { Card, CardBody, CardHeader, Field, Input, PageHeader, PersonCell, Progress, Select, StatCard, StatusBadge, Table, TD, TH, THead, TR } from "@/components/ui";
import { ActionButton, FormModal } from "@/components/forms";
import { fmtDate } from "@/lib/utils";
import { humanize } from "@/lib/constants";
import { addGoalAction } from "../me/actions";
import { closeCycleAction, launchCycleAction } from "./actions";

export const metadata: Metadata = { title: "Performance" };

export default async function PerformancePage() {
  const ctx = await requireCtx("performance.review");
  const [cycles, goals, emps] = await Promise.all([
    prisma.reviewCycle.findMany({ where: { tenantId: ctx.tenantId }, include: { reviews: true }, orderBy: { startDate: "desc" } }),
    prisma.goal.findMany({ where: { tenantId: ctx.tenantId, ...(ctx.scope !== "ALL" ? { employee: { managerId: ctx.employeeId } } : {}) }, include: { employee: true, cycle: true }, orderBy: [{ employeeId: "asc" }] }),
    prisma.employee.findMany({ where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROBATION"] } }, orderBy: { fullName: "asc" } }),
  ]);
  const manage = can(ctx, "performance.manage");
  const active = cycles.find((c) => c.status === "ACTIVE");
  return (
    <>
      <PageHeader
        title="Performance"
        emoji="🎯"
        subtitle="Review cycles, KPIs and OKRs, self and manager reviews, and calibration."
        actions={
          <>
            <FormModal trigger="+ Goal" triggerVariant="secondary" title="Set a goal" subtitle="Weights per cycle can't exceed 100%." action={addGoalAction}>
              <Field label="Employee"><Select name="employeeId" options={emps.map((e) => ({ value: e.id, label: e.fullName }))} /></Field>
              <Field label="Cycle"><Select name="cycleId" defaultValue={active?.id} options={cycles.map((c) => ({ value: c.id, label: c.name }))} /></Field>
              <Field label="Goal"><Input name="title" required /></Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Kind"><Select name="kind" options={["KPI", "OKR"]} /></Field>
                <Field label="Weight %"><Input type="number" name="weight" defaultValue="20" /></Field>
                <Field label="Due"><Input type="date" name="dueDate" /></Field>
              </div>
              <Field label="Target / key result"><Input name="target" /></Field>
            </FormModal>
            {manage && (
              <FormModal trigger="+ Launch cycle" title="Launch review cycle" subtitle="Creates a review for every active employee, with their manager as reviewer." action={launchCycleAction}>
                <Field label="Name"><Input name="name" required placeholder="2026 Annual Review" /></Field>
                <Field label="Type"><Select name="type" options={["ANNUAL", "MID_YEAR", "PROBATION", "QUARTERLY"]} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start"><Input type="date" name="startDate" required /></Field>
                  <Field label="End"><Input type="date" name="endDate" required /></Field>
                </div>
              </FormModal>
            )}
          </>
        }
      />
      {active && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Self-reviews pending" value={active.reviews.filter((r) => r.status === "SELF_REVIEW").length} tone="sunny" emoji="📝" />
          <StatCard label="Manager reviews pending" value={active.reviews.filter((r) => r.status === "MANAGER_REVIEW").length} tone="bubblegum" emoji="🧑‍🏫" />
          <StatCard label="In calibration" value={active.reviews.filter((r) => r.status === "CALIBRATION").length} tone="sky" emoji="⚖️" />
          <StatCard label="Completed" value={active.reviews.filter((r) => r.status === "COMPLETED").length} tone="lime" emoji="✅" />
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4">
          {cycles.map((c) => {
            const done = c.reviews.filter((r) => ["CALIBRATION", "COMPLETED"].includes(r.status)).length;
            return (
              <Card key={c.id}>
                <CardBody>
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/performance/${c.id}`} className="font-display text-lg font-extrabold hover:underline">{c.name}</Link>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="text-xs text-muted">{humanize(c.type)} · {fmtDate(c.startDate)} – {fmtDate(c.endDate)}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <Progress value={c.reviews.length ? (done / c.reviews.length) * 100 : 0} tone="bg-grape" />
                    <span className="font-mono text-xs">{done}/{c.reviews.length}</span>
                  </div>
                  {manage && c.status === "ACTIVE" && (
                    <div className="mt-3"><ActionButton action={closeCycleAction} fields={{ id: c.id, status: "CLOSED" }} confirm="Close this cycle?">Close cycle</ActionButton></div>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
        <Card className="lg:col-span-2">
          <CardHeader title="Goals" emoji="🎯" subtitle={`${goals.length} goals across the team`} />
          <Table>
            <THead>
              <tr><TH>Employee</TH><TH>Goal</TH><TH>Weight</TH><TH>Progress</TH><TH>Status</TH></tr>
            </THead>
            <tbody>
              {goals.map((g) => (
                <TR key={g.id}>
                  <TD><PersonCell name={g.employee.fullName} color={g.employee.avatarColor} /></TD>
                  <TD className="text-sm">
                    <span className="font-semibold">{g.title}</span>
                    <span className="block text-[11px] text-muted">{g.kind} · {g.cycle?.name ?? "No cycle"}</span>
                  </TD>
                  <TD>{g.weight}%</TD>
                  <TD className="w-40">
                    <div className="flex items-center gap-2">
                      <Progress value={g.progress} tone={g.status === "AT_RISK" ? "bg-sunny" : g.status === "OFF_TRACK" ? "bg-cherry" : "bg-lime"} />
                      <span className="font-mono text-xs">{g.progress}%</span>
                    </div>
                  </TD>
                  <TD><StatusBadge status={g.status} /></TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
