import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { Callout, Card, CardBody, CardHeader, Field, Input, LinkButton, Money, PageHeader, PersonCell, Select, StatCard, StatusBadge, Table, TD, TH, THead, TR, btnClass } from "@/components/ui";
import { ActionButton, FormModal } from "@/components/forms";
import { fmtDate, periodLabel, rm } from "@/lib/utils";
import { adjustmentAction, removeAdjustmentAction, runStepAction } from "../actions";

const STEPS = ["DRAFT", "CALCULATED", "APPROVED", "PAID", "LOCKED"];

export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  const ctx = await requireCtx("payroll.manage");
  const { runId } = await params;
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, tenantId: ctx.tenantId }, include: { company: true } });
  if (!run) notFound();
  const [slips, adjustments, payItems, employees, creator, approver] = await Promise.all([
    prisma.payslip.findMany({ where: { runId }, include: { employee: { include: { department: true } } }, orderBy: { employee: { employeeNo: "asc" } } }),
    prisma.payrollAdjustment.findMany({ where: { tenantId: ctx.tenantId, period: run.period, employee: { companyId: run.companyId } }, include: { employee: true, payItem: true } }),
    prisma.payItem.findMany({ where: { tenantId: ctx.tenantId, system: false, active: true }, orderBy: { name: "asc" } }),
    prisma.employee.findMany({ where: { tenantId: ctx.tenantId, companyId: run.companyId, status: { in: ["ACTIVE", "PROBATION", "NOTICE"] } }, orderBy: { fullName: "asc" } }),
    run.createdById ? prisma.user.findUnique({ where: { id: run.createdById } }) : null,
    run.approvedById ? prisma.user.findUnique({ where: { id: run.approvedById } }) : null,
  ]);
  const stepIdx = STEPS.indexOf(run.status);
  const editable = ["DRAFT", "CALCULATED"].includes(run.status);
  const canApprove = can(ctx.role, "payroll.approve");
  const warnings = slips.filter((s) => s.warnings);

  const Step = ({ step, label, variant = "primary", confirm }: { step: string; label: string; variant?: "primary" | "lime" | "secondary" | "danger" | "grape"; confirm?: string }) => (
    <ActionButton action={runStepAction} fields={{ id: run.id, step }} variant={variant} size="md" confirm={confirm}>
      {label}
    </ActionButton>
  );

  return (
    <>
      <PageHeader
        kicker={run.company.name}
        title={`Payroll · ${periodLabel(run.period)}`}
        emoji="💸"
        subtitle={`Pay date ${fmtDate(run.payDate, "long")}${creator ? ` · prepared by ${creator.name}` : ""}${approver ? ` · approved by ${approver.name}` : ""}`}
        actions={
          <>
            {editable && <Step step="calculate" label={run.status === "DRAFT" ? "🧮 Calculate" : "🔄 Recalculate"} variant="secondary" />}
            {run.status === "CALCULATED" && canApprove && <Step step="approve" label="✅ Approve" variant="lime" confirm="Approve this payroll? Figures will be frozen." />}
            {run.status === "APPROVED" && canApprove && (
              <>
                <Step step="reopen" label="Reopen" variant="secondary" />
                <Step step="pay" label="💸 Mark as paid" variant="primary" confirm="Confirm salaries have been paid? Payslips will be released to employees." />
              </>
            )}
            {run.status === "PAID" && canApprove && <Step step="lock" label="🔒 Lock" variant="secondary" />}
            {editable && <Step step="delete" label="Delete" variant="danger" confirm="Delete this payroll run?" />}
          </>
        }
      />

      <div className="mb-6 flex items-center gap-1 overflow-x-auto rounded-2xl border-2 border-ink bg-card p-2 shadow-brutal-sm">
        {STEPS.map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-1">
            <div className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${i < stepIdx ? "bg-mint" : i === stepIdx ? "bg-ink text-paper" : "bg-paper-2 text-muted"}`}>
              <span>{i < stepIdx ? "✓" : i + 1}</span> {s.charAt(0) + s.slice(1).toLowerCase()}
            </div>
            {i < STEPS.length - 1 && <span className="text-muted">→</span>}
          </div>
        ))}
      </div>

      {run.status === "CALCULATED" && run.createdById === ctx.userId && ctx.role !== "OWNER" && (
        <div className="mb-6">
          <Callout tone="sky" emoji="👥">
            <b>Maker-checker:</b> you prepared this run, so someone else with approval rights must approve it.
          </Callout>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="mb-6">
          <Callout tone="sunny" emoji="⚠️">
            <b>{warnings.length} payslip(s) need a look:</b>
            <ul className="mt-1 list-inside list-disc text-xs">
              {warnings.slice(0, 6).map((w) => (
                <li key={w.id}>
                  {w.employee.fullName}: {w.warnings}
                </li>
              ))}
            </ul>
          </Callout>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Employees" value={run.headcount} tone="white" emoji="🧑‍🤝‍🧑" />
        <StatCard label="Gross pay" value={rm(run.totalGross, { decimals: 0 })} tone="lime" emoji="💰" />
        <StatCard label="Net pay" value={rm(run.totalNet, { decimals: 0 })} tone="sky" emoji="🏦" />
        <StatCard label="PCB + zakat" value={rm(run.totalPcb + run.totalZakat, { decimals: 0 })} tone="sunny" emoji="🧮" />
        <StatCard label="Employer cost" value={rm(run.totalEmployerCost, { decimals: 0 })} tone="bubblegum" emoji="🧾" />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Statutory summary" emoji="🏛️" subtitle="Remit by the 15th of the following month" />
          <Table>
            <THead>
              <tr>
                <TH>Body</TH>
                <TH className="text-right">Employee</TH>
                <TH className="text-right">Employer</TH>
                <TH className="text-right">Total</TH>
                <TH>File</TH>
              </tr>
            </THead>
            <tbody>
              {[
                ["KWSP · EPF", run.totalEpfEE, run.totalEpfER, "epf"],
                ["PERKESO · SOCSO", run.totalSocsoEE, run.totalSocsoER, "socso"],
                ["PERKESO · EIS", run.totalEisEE, run.totalEisER, "socso"],
                ["LHDN · PCB (CP39)", run.totalPcb, 0, "cp39"],
                ["Zakat", run.totalZakat, 0, null],
                ["HRD Corp levy", 0, run.totalHrdf, null],
              ].map(([label, ee, er, file]) => (
                <TR key={String(label)}>
                  <TD className="font-semibold">{label}</TD>
                  <TD className="text-right"><Money value={Number(ee)} /></TD>
                  <TD className="text-right"><Money value={Number(er)} /></TD>
                  <TD className="text-right font-bold"><Money value={Number(ee) + Number(er)} /></TD>
                  <TD>
                    {file && run.status !== "DRAFT" && (
                      <a href={`/api/export/${file}?runId=${run.id}`} className="inline-flex items-center gap-1 text-xs font-bold underline">
                        <Download size={12} /> CSV
                      </a>
                    )}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Payment & files" emoji="🏦" />
          <CardBody className="space-y-3">
            <a href={`/api/export/bank?runId=${run.id}`} className={`${btnClass("secondary")} w-full`}>
              <Download size={15} /> Bank payment file
            </a>
            <a href={`/api/export/epf?runId=${run.id}`} className={`${btnClass("secondary")} w-full`}>
              <Download size={15} /> KWSP contribution file
            </a>
            <a href={`/api/export/socso?runId=${run.id}`} className={`${btnClass("secondary")} w-full`}>
              <Download size={15} /> PERKESO SOCSO + EIS file
            </a>
            <a href={`/api/export/cp39?runId=${run.id}`} className={`${btnClass("secondary")} w-full`}>
              <Download size={15} /> LHDN CP39 (PCB) file
            </a>
            <p className="text-[11px] text-muted">Check each file against the portal&apos;s current template before uploading.</p>
          </CardBody>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader
          title={`One-off items for ${periodLabel(run.period)}`}
          emoji="➕"
          subtitle="Bonus, commission, arrears, deductions. Recalculate after changes."
          action={
            editable && (
              <FormModal trigger="+ Add item" triggerSize="sm" title="One-off payroll item" action={adjustmentAction}>
                <input type="hidden" name="period" value={run.period} />
                <input type="hidden" name="runId" value={run.id} />
                <Field label="Employee">
                  <Select name="employeeId" options={employees.map((e) => ({ value: e.id, label: `${e.fullName} (${e.employeeNo})` }))} />
                </Field>
                <Field label="Pay item" hint="Bonus & arrears are taxed as additional remuneration">
                  <Select name="payItemId" options={payItems.map((p) => ({ value: p.id, label: `${p.name} · ${p.kind.toLowerCase()}${p.additional ? " · additional" : ""}` }))} />
                </Field>
                <Field label="Amount (RM)">
                  <Input type="number" step="0.01" name="amount" required />
                </Field>
                <Field label="Note">
                  <Input name="note" />
                </Field>
              </FormModal>
            )
          }
        />
        {adjustments.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">No one-off items this period.</p>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Employee</TH>
                <TH>Item</TH>
                <TH>Note</TH>
                <TH className="text-right">Amount</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {adjustments.map((a) => (
                <TR key={a.id}>
                  <TD className="font-semibold">{a.employee.fullName}</TD>
                  <TD>{a.payItem.name}</TD>
                  <TD className="text-xs">{a.note}</TD>
                  <TD className="text-right"><Money value={a.payItem.kind === "DEDUCTION" ? -a.amount : a.amount} /></TD>
                  <TD className="text-right">{editable && <ActionButton action={removeAdjustmentAction} fields={{ id: a.id }}>Remove</ActionButton>}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="Payslips" emoji="🧾" subtitle={`${slips.length} employees`} />
        {slips.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">Click Calculate to generate payslips.</p>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Employee</TH>
                <TH className="text-right">Gross</TH>
                <TH className="text-right">EPF</TH>
                <TH className="text-right">SOCSO</TH>
                <TH className="text-right">EIS</TH>
                <TH className="text-right">PCB</TH>
                <TH className="text-right">Other</TH>
                <TH className="text-right">Net</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {slips.map((s) => (
                <TR key={s.id} className={s.warnings ? "bg-sunny/20" : ""}>
                  <TD>
                    <PersonCell name={s.employee.fullName} sub={`${s.employee.employeeNo} · ${s.employee.department?.name ?? ""}`} color={s.employee.avatarColor} />
                  </TD>
                  <TD className="text-right"><Money value={s.grossPay} /></TD>
                  <TD className="text-right"><Money value={s.epfEE} /></TD>
                  <TD className="text-right"><Money value={s.socsoEE} /></TD>
                  <TD className="text-right"><Money value={s.eisEE} /></TD>
                  <TD className="text-right"><Money value={s.pcb} /></TD>
                  <TD className="text-right"><Money value={s.otherDeductions + s.zakat} /></TD>
                  <TD className="text-right font-bold"><Money value={s.netPay} /></TD>
                  <TD className="text-right">
                    <Link href={`/payroll/${run.id}/payslip/${s.id}`} className="text-xs font-bold underline">View</Link>
                  </TD>
                </TR>
              ))}
              <tr className="border-t-2 border-ink bg-paper-2 font-bold">
                <TD>Total</TD>
                <TD className="text-right"><Money value={run.totalGross} /></TD>
                <TD className="text-right"><Money value={run.totalEpfEE} /></TD>
                <TD className="text-right"><Money value={run.totalSocsoEE} /></TD>
                <TD className="text-right"><Money value={run.totalEisEE} /></TD>
                <TD className="text-right"><Money value={run.totalPcb} /></TD>
                <TD className="text-right"><Money value={slips.reduce((s, p) => s + p.otherDeductions + p.zakat, 0)} /></TD>
                <TD className="text-right"><Money value={run.totalNet} /></TD>
                <TD />
              </tr>
            </tbody>
          </Table>
        )}
      </Card>
      <div className="mt-4">
        <LinkButton href="/payroll" variant="secondary">← All runs</LinkButton>
      </div>
    </>
  );
}
