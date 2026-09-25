import Link from "next/link";
import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { Badge, Card, EmptyState, Field, Input, PageHeader, PersonCell, Select, StatCard, StatusBadge, Table, TD, TH, THead, TR, Textarea } from "@/components/ui";
import { FormModal } from "@/components/forms";
import { slaBreached, SLA_HOURS } from "@/server/services/culture.service";
import { fmtDate } from "@/lib/utils";
import { humanize } from "@/lib/constants";
import { ticketAction } from "../me/actions";

export const metadata: Metadata = { title: "Helpdesk" };

export default async function HelpdeskPage() {
  const ctx = await requireCtx();
  const agent = can(ctx.role, "helpdesk.manage");
  const tickets = await prisma.ticket.findMany({
    where: { tenantId: ctx.tenantId, ...(agent ? {} : { employeeId: ctx.employeeId ?? "-" }) },
    include: { employee: true, _count: { select: { comments: true } } },
    orderBy: { updatedAt: "desc" },
  });
  const open = tickets.filter((t) => !["RESOLVED", "CLOSED"].includes(t.status));
  return (
    <>
      <PageHeader
        title="HR helpdesk"
        emoji="🛟"
        subtitle={agent ? "Employee questions and requests, with response-time targets." : "Ask HR anything: payroll, leave, letters, benefits."}
        actions={
          ctx.employeeId && (
            <FormModal trigger="+ New request" title="Ask HR" action={ticketAction}>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Category"><Select name="category" options={["PAYROLL", "LEAVE", "BENEFITS", "LETTER_REQUEST", "POLICY", "IT", "OTHER"]} /></Field>
                <Field label="Priority"><Select name="priority" defaultValue="MEDIUM" options={["LOW", "MEDIUM", "HIGH", "URGENT"]} /></Field>
              </div>
              <Field label="Subject"><Input name="subject" required /></Field>
              <Field label="Details"><Textarea name="description" rows={5} required /></Field>
            </FormModal>
          )
        }
      />
      {agent && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Open" value={open.length} tone="sunny" emoji="📬" />
          <StatCard label="SLA breached" value={open.filter((t) => slaBreached(t.createdAt, t.priority, t.status)).length} tone="bubblegum" emoji="⏰" />
          <StatCard label="Urgent / high" value={open.filter((t) => ["URGENT", "HIGH"].includes(t.priority)).length} tone="tangerine" emoji="🔥" />
          <StatCard label="Resolved" value={tickets.length - open.length} tone="lime" emoji="✅" />
        </div>
      )}
      <Card>
        {tickets.length === 0 ? (
          <EmptyState emoji="🛟" title="No tickets" body="Questions for HR will show up here." />
        ) : (
          <Table>
            <THead>
              <tr><TH>Ref</TH><TH>Subject</TH>{agent && <TH>From</TH>}<TH>Category</TH><TH>Priority</TH><TH>SLA</TH><TH>Status</TH><TH>Updated</TH></tr>
            </THead>
            <tbody>
              {tickets.map((t) => (
                <TR key={t.id}>
                  <TD className="font-mono text-xs">{t.refNo}</TD>
                  <TD><Link href={`/helpdesk/${t.id}`} className="font-semibold underline decoration-2 underline-offset-2">{t.subject}</Link><span className="ml-1 text-xs text-muted">💬 {t._count.comments}</span></TD>
                  {agent && <TD><PersonCell name={t.employee.fullName} color={t.employee.avatarColor} /></TD>}
                  <TD className="text-xs">{humanize(t.category)}</TD>
                  <TD><StatusBadge status={t.priority} /></TD>
                  <TD>{slaBreached(t.createdAt, t.priority, t.status) ? <Badge tone="red">Breached</Badge> : <span className="text-xs text-muted">{SLA_HOURS[t.priority]}h</span>}</TD>
                  <TD><StatusBadge status={t.status} /></TD>
                  <TD className="text-xs">{fmtDate(t.updatedAt)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
