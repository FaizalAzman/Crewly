import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { Badge, Callout, Card, CardHeader, Checkbox, Field, Input, Money, PageHeader, PersonCell, Select, StatusBadge, Table, Tabs, TD, TH, THead, TR, Textarea } from "@/components/ui";
import { ActionButton, FormModal } from "@/components/forms";
import { ChecklistBoard } from "../onboarding/checklist-board";
import { fmtDate, todayMY } from "@/lib/utils";
import { humanize } from "@/lib/constants";
import { createSeparationAction, separationStepAction } from "./actions";

export const metadata: Metadata = { title: "Offboarding" };

export default async function OffboardingPage({ searchParams }: { searchParams: Promise<{ tab?: string; employee?: string }> }) {
  const ctx = await requireCtx("lifecycle.manage");
  const sp = await searchParams;
  const tab = sp.tab ?? "separations";
  const [seps, emps] = await Promise.all([
    prisma.separation.findMany({ where: { tenantId: ctx.tenantId }, include: { employee: { include: { assets: { where: { status: "ASSIGNED" } } } } }, orderBy: { createdAt: "desc" } }),
    prisma.employee.findMany({ where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROBATION"] } }, orderBy: { fullName: "asc" } }),
  ]);
  const today = todayMY();
  return (
    <>
      <PageHeader
        title="Offboarding"
        emoji="👋"
        subtitle="Resignations, terminations and retirements: notice periods (EA s.12), termination benefits, leave encashment, CP22A and asset returns."
        actions={
          <FormModal trigger="+ Record separation" title="Record a separation" subtitle="Notice, termination benefit and leave encashment are calculated automatically." action={createSeparationAction} wide>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Employee" className="md:col-span-2">
                <Select name="employeeId" defaultValue={sp.employee} options={emps.map((e) => ({ value: e.id, label: `${e.fullName} · ${e.jobTitle}` }))} />
              </Field>
              <Field label="Type">
                <Select name="type" options={["RESIGNATION", "TERMINATION", "RETRENCHMENT", "RETIREMENT", "END_OF_CONTRACT", "MUTUAL", "DEATH"]} />
              </Field>
              <div />
              <Field label="Notice given on">
                <Input type="date" name="noticeDate" defaultValue={today.toISOString().slice(0, 10)} />
              </Field>
              <Field label="Last working day">
                <Input type="date" name="lastWorkingDate" required />
              </Field>
              <Field label="Reason" className="md:col-span-2">
                <Textarea name="reason" />
              </Field>
              <Checkbox name="waiveShortfall" label="Waive notice shortfall (no payment in lieu either way)" />
            </div>
            <Callout emoji="⚖️">
              Retrenchment and termination (not for misconduct) with 12+ months of service entitle employees earning ≤ RM4,000 to termination benefits: 10, 15 or 20 days&apos; wages per year of service.
            </Callout>
          </FormModal>
        }
      />
      <Tabs active={tab} tabs={[{ key: "separations", label: "Separations", href: "/offboarding?tab=separations", count: seps.filter((s) => ["PENDING", "APPROVED"].includes(s.status)).length }, { key: "checklists", label: "Clearance checklists", href: "/offboarding?tab=checklists" }]} />
      {tab === "checklists" ? (
        <ChecklistBoard type="OFFBOARDING" />
      ) : (
        <Card>
          <CardHeader title="Separations" emoji="📄" />
          <Table>
            <THead>
              <tr>
                <TH>Employee</TH>
                <TH>Type</TH>
                <TH>Notice / last day</TH>
                <TH>Notice</TH>
                <TH className="text-right">Settlement</TH>
                <TH>Status</TH>
                <TH>Actions</TH>
              </tr>
            </THead>
            <tbody>
              {seps.map((s) => (
                <TR key={s.id}>
                  <TD>
                    <PersonCell name={s.employee.fullName} sub={s.reason ?? s.employee.jobTitle} color={s.employee.avatarColor} href={`/employees/${s.employeeId}`} />
                  </TD>
                  <TD>
                    <Badge tone="gray">{humanize(s.type)}</Badge>
                  </TD>
                  <TD className="text-xs">
                    {fmtDate(s.noticeDate)} → <b>{fmtDate(s.lastWorkingDate)}</b>
                  </TD>
                  <TD className="text-xs">
                    Needs {s.requiredNoticeDays}d{s.shortfallDays > 0 && <Badge tone="orange" className="ml-1">short {s.shortfallDays}d</Badge>}
                  </TD>
                  <TD className="text-right text-xs">
                    {s.leaveEncashAmount > 0 && (
                      <span className="block">
                        Leave {s.leaveEncashDays}d: <Money value={s.leaveEncashAmount} />
                      </span>
                    )}
                    {s.terminationBenefit > 0 && (
                      <span className="block">
                        Term. benefit: <Money value={s.terminationBenefit} />
                      </span>
                    )}
                    {s.noticePayInLieu !== 0 && (
                      <span className="block">
                        {s.noticePayInLieu < 0 ? "Indemnity owed" : "Notice pay"}: <Money value={Math.abs(s.noticePayInLieu)} />
                      </span>
                    )}
                  </TD>
                  <TD>
                    <StatusBadge status={s.status} />
                    {s.employee.assets.length > 0 && s.status !== "COMPLETED" && <Badge tone="yellow" className="ml-1">💻 {s.employee.assets.length} asset(s)</Badge>}
                    {!s.cp22aSubmitted && s.status === "APPROVED" && <Badge tone="red" className="ml-1">CP22A</Badge>}
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {s.status === "PENDING" && <ActionButton action={separationStepAction} fields={{ id: s.id, step: "approve" }} variant="lime">Approve</ActionButton>}
                      {s.status === "APPROVED" && !s.cp22aSubmitted && <ActionButton action={separationStepAction} fields={{ id: s.id, step: "cp22a" }}>CP22A sent</ActionButton>}
                      {["APPROVED", "COMPLETED"].includes(s.status) && !s.settlementPeriod && (s.leaveEncashAmount > 0 || s.terminationBenefit > 0 || s.noticePayInLieu !== 0) && (
                        <ActionButton action={separationStepAction} fields={{ id: s.id, step: "settle" }} variant="grape" confirm="Post leave encashment, termination benefit and notice pay/indemnity to the final month's payroll, and recover outstanding loans?">
                          Post to payroll
                        </ActionButton>
                      )}
                      {s.settlementPeriod && <Badge tone="green">💸 Settled in {s.settlementPeriod}</Badge>}
                      {s.status === "APPROVED" && (
                        <FormModal trigger="Complete" triggerSize="sm" title={`Complete separation · ${s.employee.fullName}`} action={separationStepAction}>
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="step" value="complete" />
                          <Field label="Exit interview notes">
                            <Textarea name="exitInterview" rows={4} />
                          </Field>
                          <Checkbox name="rehireEligible" label="Eligible for rehire" defaultChecked />
                          <Callout emoji="✅">Requires: last day passed, all assets returned, CP22A submitted. The employee&apos;s login will be deactivated.</Callout>
                        </FormModal>
                      )}
                      {["PENDING", "APPROVED"].includes(s.status) && <ActionButton action={separationStepAction} fields={{ id: s.id, step: "withdraw" }} variant="ghost" confirm="Withdraw this separation?">Withdraw</ActionButton>}
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
