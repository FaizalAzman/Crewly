import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { Card, CardHeader, Field, Input, Money, PageHeader, PersonCell, Progress, StatCard, StatusBadge, Table, TD, TH, THead, TR } from "@/components/ui";
import { DecideButtons } from "@/components/decide-buttons";
import { LoanButton } from "@/components/request-forms";
import { loanSchedule, recordLoanRepayment } from "@/server/services/money.service";
import { FormModal } from "@/components/forms";
import { act } from "@/server/action";
import { numField, rm, str } from "@/lib/utils";
import { humanize } from "@/lib/constants";
import type { ActionState } from "@/server/types";

async function repayAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("loans.manage");
  return act(async () => {
    const l = await recordLoanRepayment(ctx, str(fd, "id"), numField(fd, "amount"), str(fd, "note"));
    return l.status === "SETTLED" ? "Loan fully settled 🎉" : `Recorded. Balance now RM${l.balance.toFixed(2)}`;
  }, ["/loans"]);
}

export const metadata: Metadata = { title: "Loans & advances" };

export default async function LoansPage() {
  const ctx = await requireCtx("loans.manage");
  const loans = await prisma.loan.findMany({ where: { tenantId: ctx.tenantId }, include: { employee: true, repayments: { orderBy: { period: "asc" } } }, orderBy: { createdAt: "desc" } });
  const active = loans.filter((l) => l.status === "ACTIVE");
  return (
    <>
      <PageHeader title="Loans & advances" emoji="🪙" subtitle="Salary advances (max 50% of basic, recovered next payroll) and staff loans (instalments ≤ 25% of basic, up to 60 months)." actions={<LoanButton tenantId={ctx.tenantId} onBehalf btn={{ label: "+ New loan", variant: "primary" }} />} />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Outstanding" value={rm(active.reduce((s, l) => s + l.balance, 0), { decimals: 0 })} tone="sunny" emoji="💰" />
        <StatCard label="Active loans" value={active.length} tone="sky" emoji="📄" />
        <StatCard label="Monthly recovery" value={rm(active.reduce((s, l) => s + Math.min(l.installment, l.balance), 0), { decimals: 0 })} tone="lime" emoji="🔁" />
        <StatCard label="Pending" value={loans.filter((l) => l.status === "PENDING").length} tone="bubblegum" emoji="⏳" />
      </div>
      <Card>
        <CardHeader title="All loans" emoji="📒" />
        <Table>
          <THead>
            <tr>
              <TH>Employee</TH>
              <TH>Type</TH>
              <TH className="text-right">Principal</TH>
              <TH className="text-right">Instalment</TH>
              <TH>Schedule</TH>
              <TH>Repaid</TH>
              <TH className="text-right">Balance</TH>
              <TH>Status</TH>
              <TH />
            </tr>
          </THead>
          <tbody>
            {loans.map((l) => {
              const sched = loanSchedule(l.principal, l.installment, l.startPeriod);
              const pct = ((l.principal - l.balance) / l.principal) * 100;
              return (
                <TR key={l.id}>
                  <TD><PersonCell name={l.employee.fullName} sub={l.reason ?? ""} color={l.employee.avatarColor} /></TD>
                  <TD className="text-xs">{humanize(l.type)}</TD>
                  <TD className="text-right"><Money value={l.principal} /></TD>
                  <TD className="text-right"><Money value={l.installment} /></TD>
                  <TD className="text-xs">{l.startPeriod} → {sched[sched.length - 1]?.period} ({sched.length} mo)</TD>
                  <TD className="w-40">
                    <Progress value={pct} tone="bg-mint" />
                    <span className="text-[10px] text-muted">{l.repayments.length} payment(s)</span>
                  </TD>
                  <TD className="text-right font-bold"><Money value={l.balance} /></TD>
                  <TD><StatusBadge status={l.status} /></TD>
                  <TD>
                    {l.status === "PENDING" && <DecideButtons kind="loan" id={l.id} requireReason={false} />}
                    {l.status === "ACTIVE" && (
                      <FormModal trigger="Repayment" triggerSize="sm" triggerVariant="secondary" title={`Record repayment · ${l.employee.fullName}`} subtitle={`Outstanding RM${l.balance.toFixed(2)}`} action={repayAction}>
                        <input type="hidden" name="id" value={l.id} />
                        <Field label="Amount (RM)"><Input type="number" step="0.01" name="amount" defaultValue={l.balance} required /></Field>
                        <Field label="How was it repaid?"><Input name="note" required placeholder="Bank transfer ref / cash receipt no." /></Field>
                      </FormModal>
                    )}
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
