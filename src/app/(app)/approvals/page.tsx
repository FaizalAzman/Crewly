import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { listPendingApprovals } from "@/server/services/approvals.service";
import { Badge, Card, CardHeader, EmptyState, Money, PageHeader, PersonCell, Table, TD, TH, THead, TR } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { DecideButtons } from "@/components/decide-buttons";
import { fmtDate, rm } from "@/lib/utils";
import { humanize } from "@/lib/constants";
import { bulkApproveAction } from "./actions";

export const metadata: Metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  const ctx = await requireCtx("leave.approve");
  const p = await listPendingApprovals(ctx);
  const total = p.leave.length + p.claims.length + p.overtime.length + p.loans.length + p.compensation.length;

  const Bulk = ({ kind, ids }: { kind: string; ids: string[] }) =>
    ids.length > 1 ? (
      <ActionForm action={bulkApproveAction} resetOnSuccess={false}>
        <input type="hidden" name="kind" value={kind} />
        {ids.map((id) => (
          <input key={id} type="hidden" name="ids" value={id} />
        ))}
        <SubmitButton size="sm" variant="primary">
          Approve all {ids.length}
        </SubmitButton>
      </ActionForm>
    ) : null;

  return (
    <>
      <PageHeader title="Approvals" emoji="✅" subtitle={total ? `${total} item(s) waiting for you.` : "Inbox zero. Nice work! 🎉"} />
      {total === 0 && (
        <Card>
          <EmptyState emoji="🏖️" title="Nothing to approve" body="New leave, claims, overtime and loan requests from your team will appear here." />
        </Card>
      )}
      <div className="space-y-6">
        {p.leave.length > 0 && (
          <Card>
            <CardHeader title="Leave" emoji="🌴" subtitle={`${p.leave.length} pending`} action={<Bulk kind="leave" ids={p.leave.map((l) => l.id)} />} />
            <Table>
              <THead>
                <tr>
                  <TH>Employee</TH>
                  <TH>Type</TH>
                  <TH>Dates</TH>
                  <TH>Days</TH>
                  <TH>Reason</TH>
                  <TH />
                </tr>
              </THead>
              <tbody>
                {p.leave.map((l) => (
                  <TR key={l.id}>
                    <TD>
                      <PersonCell name={l.employee.fullName} sub={l.employee.department?.name} color={l.employee.avatarColor} href={`/employees/${l.employee.id}?tab=leave`} />
                    </TD>
                    <TD>
                      {l.leaveType.emoji} {l.leaveType.name}
                    </TD>
                    <TD className="text-xs">
                      {fmtDate(l.startDate)} – {fmtDate(l.endDate)} {l.halfDay && `(${l.halfDay})`}
                    </TD>
                    <TD className="font-bold">{l.days}</TD>
                    <TD className="max-w-xs text-xs">
                      {l.reason}
                      {l.attachment && <span className="block text-muted">📎 {l.attachment}</span>}
                    </TD>
                    <TD>
                      <DecideButtons kind="leave" id={l.id} />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Card>
        )}

        {p.claims.length > 0 && (
          <Card>
            <CardHeader title="Claims" emoji="🧾" subtitle={`${rm(p.claims.reduce((s, c) => s + c.amount, 0))} pending`} action={<Bulk kind="claim" ids={p.claims.map((c) => c.id)} />} />
            <Table>
              <THead>
                <tr>
                  <TH>Employee</TH>
                  <TH>Type</TH>
                  <TH>Date</TH>
                  <TH>Details</TH>
                  <TH className="text-right">Amount</TH>
                  <TH />
                </tr>
              </THead>
              <tbody>
                {p.claims.map((c) => (
                  <TR key={c.id}>
                    <TD>
                      <PersonCell name={c.employee.fullName} sub={c.employee.department?.name} color={c.employee.avatarColor} />
                    </TD>
                    <TD>
                      {c.claimType.emoji} {c.claimType.name}
                    </TD>
                    <TD className="text-xs">{fmtDate(c.date)}</TD>
                    <TD className="max-w-xs text-xs">
                      {c.description}
                      {c.merchant && <span className="block text-muted">@ {c.merchant}</span>}
                      {c.receiptUrl && <span className="block text-muted">📎 {c.receiptUrl}</span>}
                    </TD>
                    <TD className="text-right font-bold">
                      <Money value={c.amount} />
                    </TD>
                    <TD>
                      <DecideButtons kind="claim" id={c.id} />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Card>
        )}

        {p.overtime.length > 0 && (
          <Card>
            <CardHeader title="Overtime" emoji="⏱️" action={<Bulk kind="overtime" ids={p.overtime.map((o) => o.id)} />} />
            <Table>
              <THead>
                <tr>
                  <TH>Employee</TH>
                  <TH>Date</TH>
                  <TH>Day type</TH>
                  <TH>Hours</TH>
                  <TH>Reason</TH>
                  <TH className="text-right">Pay</TH>
                  <TH />
                </tr>
              </THead>
              <tbody>
                {p.overtime.map((o) => (
                  <TR key={o.id}>
                    <TD>
                      <PersonCell name={o.employee.fullName} sub={o.employee.department?.name} color={o.employee.avatarColor} />
                    </TD>
                    <TD className="text-xs">{fmtDate(o.date)}</TD>
                    <TD>
                      <Badge tone={o.dayType === "PUBLIC_HOLIDAY" ? "pink" : o.dayType === "REST_DAY" ? "purple" : "gray"}>
                        {humanize(o.dayType)} · {o.multiplier}×
                      </Badge>
                    </TD>
                    <TD>
                      {o.hours}h{o.normalHours ? ` + ${o.normalHours}h normal` : ""}
                    </TD>
                    <TD className="text-xs">{o.reason}</TD>
                    <TD className="text-right font-bold">
                      <Money value={o.amount} />
                    </TD>
                    <TD>
                      <DecideButtons kind="overtime" id={o.id} requireReason={false} />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Card>
        )}

        {p.loans.length > 0 && (
          <Card>
            <CardHeader title="Loans & advances" emoji="🪙" />
            <Table>
              <THead>
                <tr>
                  <TH>Employee</TH>
                  <TH>Type</TH>
                  <TH className="text-right">Amount</TH>
                  <TH className="text-right">Instalment</TH>
                  <TH>From</TH>
                  <TH>Reason</TH>
                  <TH />
                </tr>
              </THead>
              <tbody>
                {p.loans.map((l) => (
                  <TR key={l.id}>
                    <TD>
                      <PersonCell name={l.employee.fullName} sub={l.employee.jobTitle} color={l.employee.avatarColor} />
                    </TD>
                    <TD>{humanize(l.type)}</TD>
                    <TD className="text-right"><Money value={l.principal} /></TD>
                    <TD className="text-right"><Money value={l.installment} /></TD>
                    <TD>{l.startPeriod}</TD>
                    <TD className="text-xs">{l.reason}</TD>
                    <TD>
                      <DecideButtons kind="loan" id={l.id} requireReason={false} />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Card>
        )}

        {p.compensation.length > 0 && (
          <Card>
            <CardHeader title="Compensation changes" emoji="📈" />
            <Table>
              <THead>
                <tr>
                  <TH>Employee</TH>
                  <TH>Change</TH>
                  <TH>Effective</TH>
                  <TH className="text-right">Salary</TH>
                  <TH>Reason</TH>
                  <TH />
                </tr>
              </THead>
              <tbody>
                {p.compensation.map((c) => (
                  <TR key={c.id}>
                    <TD>
                      <PersonCell name={c.employee.fullName} sub={c.employee.jobTitle} color={c.employee.avatarColor} />
                    </TD>
                    <TD>
                      <Badge tone="purple">{humanize(c.type)}</Badge> {c.newTitle && <span className="text-xs">→ {c.newTitle}</span>}
                    </TD>
                    <TD className="text-xs">{fmtDate(c.effectiveDate)}</TD>
                    <TD className="text-right font-mono text-xs">
                      {c.type === "BONUS" ? rm(c.bonusAmount) : `${rm(c.oldSalary, { decimals: 0 })} → ${rm(c.newSalary, { decimals: 0 })}`}
                    </TD>
                    <TD className="text-xs">{c.reason}</TD>
                    <TD>
                      <DecideButtons kind="compensation" id={c.id} requireReason={false} />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </div>
    </>
  );
}
