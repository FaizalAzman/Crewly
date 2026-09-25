import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { Avatar, Badge, Card, CardBody, CardHeader, Checkbox, Field, Input, KV, LinkButton, PageHeader, Select, StatusBadge, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { act } from "@/server/action";
import { setTicketStatus } from "@/server/services/culture.service";
import { fmtDate, fmtTime, optStr, str } from "@/lib/utils";
import { humanize } from "@/lib/constants";
import type { ActionState } from "@/server/types";
import { ticketCommentAction } from "../../me/actions";

async function statusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("helpdesk.manage");
  return act(async () => {
    await setTicketStatus(ctx, str(fd, "id"), str(fd, "status"), optStr(fd, "assignee") ?? undefined);
    revalidatePath(`/helpdesk/${str(fd, "id")}`);
    return "Ticket updated";
  });
}

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const agent = can(ctx.role, "helpdesk.manage");
  const t = await prisma.ticket.findFirst({
    where: { id, tenantId: ctx.tenantId, ...(agent ? {} : { employeeId: ctx.employeeId ?? "-" }) },
    include: { employee: true, comments: { where: agent ? {} : { internal: false }, orderBy: { createdAt: "asc" } } },
  });
  if (!t) notFound();
  return (
    <>
      <PageHeader kicker={t.refNo} title={t.subject} emoji="🛟" actions={<LinkButton href="/helpdesk" variant="secondary">← Helpdesk</LinkButton>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardBody>
              <div className="flex items-center gap-2 text-sm">
                <Avatar name={t.employee.fullName} color={t.employee.avatarColor} size={28} />
                <b>{t.employee.fullName}</b> <span className="text-muted">· {fmtDate(t.createdAt, "long")}</span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm">{t.description}</p>
            </CardBody>
          </Card>
          {t.comments.map((c) => (
            <div key={c.id} className={`rounded-2xl border-2 border-ink p-4 text-sm shadow-brutal-sm ${c.internal ? "bg-sunny/40" : "bg-card"}`}>
              <p className="text-xs"><b>{c.authorName}</b> · {fmtDate(c.createdAt)} {fmtTime(c.createdAt)} {c.internal && <Badge tone="yellow">Internal note</Badge>}</p>
              <p className="mt-2 whitespace-pre-wrap">{c.body}</p>
            </div>
          ))}
          {t.status !== "CLOSED" && (
            <Card>
              <CardBody>
                <ActionForm action={ticketCommentAction} className="space-y-3">
                  <input type="hidden" name="ticketId" value={t.id} />
                  <Textarea name="body" rows={4} placeholder="Write a reply…" required />
                  <div className="flex items-center justify-between">
                    {agent ? <Checkbox name="internal" label="Internal note (hidden from employee)" /> : <span />}
                    <SubmitButton>Send</SubmitButton>
                  </div>
                </ActionForm>
              </CardBody>
            </Card>
          )}
        </div>
        <Card>
          <CardHeader title="Details" emoji="🔎" />
          <CardBody className="space-y-4">
            <dl className="grid grid-cols-2 gap-3">
              <KV label="Status" value={<StatusBadge status={t.status} />} />
              <KV label="Priority" value={<StatusBadge status={t.priority} />} />
              <KV label="Category" value={humanize(t.category)} />
              <KV label="Assignee" value={t.assignee ?? "Unassigned"} />
            </dl>
            {agent && (
              <ActionForm action={statusAction} resetOnSuccess={false} className="space-y-3 border-t-2 border-dashed border-soft-line pt-4">
                <input type="hidden" name="id" value={t.id} />
                <Field label="Status"><Select name="status" defaultValue={t.status} options={["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"]} /></Field>
                <Field label="Assignee"><Input name="assignee" defaultValue={t.assignee ?? ctx.userName} /></Field>
                <SubmitButton variant="secondary" className="w-full">Update</SubmitButton>
              </ActionForm>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
