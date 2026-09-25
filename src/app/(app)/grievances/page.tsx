import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { Badge, Callout, Card, CardHeader, Field, PageHeader, Select, StatCard, StatusBadge, Table, TD, TH, THead, TR, Textarea } from "@/components/ui";
import { FormModal } from "@/components/forms";
import { act } from "@/server/action";
import { updateGrievance } from "@/server/services/relations.service";
import { daysBetween, fmtDate, optStr, str, todayMY } from "@/lib/utils";
import { humanize } from "@/lib/constants";
import type { ActionState } from "@/server/types";

export const metadata: Metadata = { title: "Grievances" };

async function updateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("er.manage");
  return act(async () => {
    await updateGrievance(ctx, str(fd, "id"), str(fd, "status"), optStr(fd, "resolution") ?? undefined);
    revalidatePath("/grievances");
    return "Updated";
  });
}

export default async function GrievancesPage() {
  const ctx = await requireCtx("er.manage");
  const rows = await prisma.grievance.findMany({ where: { tenantId: ctx.tenantId }, include: { employee: true }, orderBy: { createdAt: "desc" } });
  const today = todayMY();
  const sh = rows.filter((r) => r.category === "SEXUAL_HARASSMENT" && !["RESOLVED", "CLOSED"].includes(r.status));
  return (
    <>
      <PageHeader title="Grievances & harassment" emoji="🛡️" subtitle="A confidential channel for workplace concerns. Employees raise them from Me → Speak up." />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Open" value={rows.filter((r) => ["OPEN", "INVESTIGATING"].includes(r.status)).length} tone="sunny" emoji="📂" />
        <StatCard label="Harassment (open)" value={sh.length} tone="bubblegum" emoji="🚨" />
        <StatCard label="Anonymous" value={rows.filter((r) => r.anonymous).length} tone="sky" emoji="🕶️" />
        <StatCard label="Resolved" value={rows.filter((r) => ["RESOLVED", "CLOSED"].includes(r.status)).length} tone="lime" emoji="✅" />
      </div>
      <div className="mb-6">
        <Callout tone="bubblegum" emoji="⚖️">
          <b>Sexual harassment (EA Part XVA):</b> every complaint must be inquired into. If the company decides not to inquire, it must tell the complainant in writing, with reasons, <b>within 30 days</b>. Complainants may also go to the Anti-Sexual Harassment Tribunal.
        </Callout>
      </div>
      <Card>
        <CardHeader title="Cases" emoji="🗂️" />
        <Table>
          <THead>
            <tr><TH>Ref</TH><TH>From</TH><TH>Category</TH><TH>Subject</TH><TH>Priority</TH><TH>Age</TH><TH>Status</TH><TH /></tr>
          </THead>
          <tbody>
            {rows.map((g) => {
              const due = g.inquiryDueDate ? daysBetween(today, g.inquiryDueDate) : null;
              return (
                <TR key={g.id}>
                  <TD className="font-mono text-xs">{g.refNo}</TD>
                  <TD className="text-sm">{g.anonymous ? <Badge tone="gray">🕶️ Anonymous</Badge> : g.employee?.fullName}</TD>
                  <TD><Badge tone={g.category === "SEXUAL_HARASSMENT" ? "red" : "gray"}>{humanize(g.category)}</Badge></TD>
                  <TD className="max-w-xs text-sm">
                    <span className="font-semibold">{g.subject}</span>
                    <span className="block text-xs text-muted">{g.description}</span>
                    {g.resolution && <span className="block text-xs text-ink-2">✅ {g.resolution}</span>}
                  </TD>
                  <TD><StatusBadge status={g.priority} /></TD>
                  <TD className="text-xs">
                    {daysBetween(g.createdAt, today)}d
                    {due !== null && !["RESOLVED", "CLOSED"].includes(g.status) && <Badge tone={due < 7 ? "red" : "yellow"} className="ml-1">30-day: {due}d left</Badge>}
                  </TD>
                  <TD><StatusBadge status={g.status} /></TD>
                  <TD>
                    <FormModal trigger="Update" triggerSize="sm" triggerVariant="secondary" title={`${g.refNo} · ${g.subject}`} subtitle={`Filed ${fmtDate(g.createdAt, "long")}`} action={updateAction}>
                      <input type="hidden" name="id" value={g.id} />
                      <Field label="Status"><Select name="status" defaultValue={g.status} options={["OPEN", "INVESTIGATING", "RESOLVED", "CLOSED", "REFERRED"]} /></Field>
                      <Field label="Resolution / findings"><Textarea name="resolution" defaultValue={g.resolution ?? ""} rows={4} /></Field>
                    </FormModal>
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
