import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { Badge, Callout, Card, CardBody, CardHeader, Field, Input, PageHeader, PersonCell, Select, StatusBadge, Textarea } from "@/components/ui";
import { FormModal } from "@/components/forms";
import { act } from "@/server/action";
import { closeCase, decideCase, DISCIPLINARY_STAGES, issueShowCause, openCase, recordReply, scheduleInquiry, showCauseLetter, suspendPendingInquiry } from "@/server/services/relations.service";
import { ActionButton } from "@/components/forms";
import { dateField, fmtDate, numField, str } from "@/lib/utils";
import { humanize } from "@/lib/constants";
import type { ActionState } from "@/server/types";

export const metadata: Metadata = { title: "Disciplinary" };

async function openAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("er.manage");
  return act(async () => {
    const c = await openCase(ctx, { employeeId: str(fd, "employeeId"), category: str(fd, "category"), severity: str(fd, "severity"), incidentDate: dateField(fd, "incidentDate") as Date, description: str(fd, "description") });
    revalidatePath("/disciplinary");
    return `Case ${c.caseNo} opened`;
  });
}

async function stepAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("er.manage");
  return act(async () => {
    const id = str(fd, "id");
    switch (str(fd, "step")) {
      case "showcause":
        await issueShowCause(ctx, id, numField(fd, "replyDays", 3));
        break;
      case "reply":
        await recordReply(ctx, id, str(fd, "reply"));
        break;
      case "suspend":
        await suspendPendingInquiry(ctx, id, numField(fd, "days"));
        break;
      case "inquiry":
        await scheduleInquiry(ctx, id, dateField(fd, "date") as Date, str(fd, "panel"));
        break;
      case "decide":
        await decideCase(ctx, id, str(fd, "outcome"), str(fd, "notes"));
        break;
      case "close":
        await closeCase(ctx, id);
        break;
    }
    revalidatePath("/disciplinary");
    return "Case updated";
  });
}

async function letterAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("er.manage");
  return act(async () => {
    await showCauseLetter(ctx, str(fd, "id"));
    revalidatePath("/documents");
    return "Show-cause letter drafted. Review and issue it in Letters & policies.";
  });
}

export default async function DisciplinaryPage() {
  const ctx = await requireCtx("er.manage");
  const [cases, emps] = await Promise.all([
    prisma.disciplinaryCase.findMany({ where: { tenantId: ctx.tenantId }, include: { employee: true }, orderBy: { createdAt: "desc" } }),
    prisma.employee.findMany({ where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROBATION", "NOTICE"] } }, orderBy: { fullName: "asc" } }),
  ]);
  const Step = ({ id, step, label, children, variant = "secondary" }: { id: string; step: string; label: string; children?: React.ReactNode; variant?: "secondary" | "primary" | "grape" | "danger" }) => (
    <FormModal trigger={label} triggerSize="sm" triggerVariant={variant} title={label} action={stepAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="step" value={step} />
      {children ?? <p className="text-sm">Confirm this step?</p>}
    </FormModal>
  );
  return (
    <>
      <PageHeader
        title="Disciplinary"
        emoji="⚖️"
        subtitle="Due process per Malaysian industrial relations practice: report → investigation → show-cause → domestic inquiry → decision."
        actions={
          <FormModal trigger="+ Open case" title="Open disciplinary case" action={openAction}>
            <Field label="Employee"><Select name="employeeId" options={emps.map((e) => ({ value: e.id, label: e.fullName }))} /></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Category"><Select name="category" options={["MISCONDUCT", "ATTENDANCE", "PERFORMANCE", "HARASSMENT", "FRAUD", "SAFETY", "OTHER"]} /></Field>
              <Field label="Severity"><Select name="severity" options={["MINOR", "MAJOR", "GROSS"]} /></Field>
              <Field label="Incident date"><Input type="date" name="incidentDate" required /></Field>
            </div>
            <Field label="Description"><Textarea name="description" rows={4} required /></Field>
          </FormModal>
        }
      />
      <div className="mb-6">
        <Callout emoji="⚖️">
          <b>Natural justice:</b> no warning, suspension or dismissal without giving the employee a chance to explain (show-cause). Dismissal or demotion requires a <b>domestic inquiry</b> (EA s.14(1)). Suspension pending inquiry is capped at <b>2 weeks</b> with at least half pay (s.14(2)).
        </Callout>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {cases.map((c) => {
          const idx = DISCIPLINARY_STAGES.indexOf(c.stage as (typeof DISCIPLINARY_STAGES)[number]);
          return (
            <Card key={c.id}>
              <CardHeader title={<PersonCell name={c.employee.fullName} sub={`${c.caseNo} · ${humanize(c.category)}`} color={c.employee.avatarColor} />} action={<Badge tone={c.severity === "GROSS" ? "red" : c.severity === "MAJOR" ? "orange" : "yellow"}>{c.severity}</Badge>} />
              <CardBody className="space-y-3">
                <div className="flex gap-1">
                  {DISCIPLINARY_STAGES.map((s, i) => (
                    <div key={s} title={humanize(s)} className={`h-2 flex-1 rounded-full border border-ink ${i <= idx ? "bg-grape" : "bg-paper-2"}`} />
                  ))}
                </div>
                <p className="text-xs font-bold">Stage: <StatusBadge status={c.stage} /> {c.suspended && <Badge tone="red">Suspended {c.suspensionDays}d</Badge>}</p>
                <p className="text-sm">{c.description}</p>
                <ul className="space-y-0.5 text-xs text-ink-2">
                  <li>Incident: {fmtDate(c.incidentDate, "long")}</li>
                  {c.showCauseIssuedAt && <li>Show-cause issued {fmtDate(c.showCauseIssuedAt)} · reply due {fmtDate(c.replyDueDate)}</li>}
                  {c.replyReceived && <li>Reply: &ldquo;{c.replyReceived}&rdquo;</li>}
                  {c.inquiryDate && <li>Domestic inquiry {fmtDate(c.inquiryDate)} · panel: {c.inquiryPanel}</li>}
                  {c.outcome && <li className="font-bold">Outcome: {humanize(c.outcome)}. {c.outcomeNotes}</li>}
                </ul>
                <div className="flex flex-wrap gap-2 border-t-2 border-dashed border-soft-line pt-3">
                  {["REPORTED", "INVESTIGATION"].includes(c.stage) && (
                    <Step id={c.id} step="showcause" label="Issue show-cause" variant="primary">
                      <Field label="Days to reply"><Input type="number" name="replyDays" defaultValue="3" min={2} /></Field>
                    </Step>
                  )}
                  {c.stage === "SHOW_CAUSE" && (
                    <ActionButton action={letterAction} fields={{ id: c.id }}>✉️ Draft letter</ActionButton>
                  )}
                  {c.stage === "SHOW_CAUSE" && !c.replyReceived && (
                    <Step id={c.id} step="reply" label="Record reply">
                      <Field label="Employee's explanation"><Textarea name="reply" required /></Field>
                    </Step>
                  )}
                  {c.stage === "SHOW_CAUSE" && (
                    <Step id={c.id} step="inquiry" label="Schedule inquiry" variant="grape">
                      <Field label="Inquiry date"><Input type="date" name="date" required /></Field>
                      <Field label="Panel members"><Input name="panel" required placeholder="Independent chair + 2 members" /></Field>
                    </Step>
                  )}
                  {!["DECIDED", "CLOSED"].includes(c.stage) && !c.suspended && (
                    <Step id={c.id} step="suspend" label="Suspend pending inquiry">
                      <Field label="Days (max 14)"><Input type="number" name="days" defaultValue="7" max={14} /></Field>
                    </Step>
                  )}
                  {!["DECIDED", "CLOSED"].includes(c.stage) && (
                    <Step id={c.id} step="decide" label="Record decision" variant="danger">
                      <Field label="Outcome"><Select name="outcome" options={["NO_ACTION", "VERBAL_WARNING", "WRITTEN_WARNING", "FINAL_WARNING", "SUSPENSION", "DEMOTION", "DISMISSAL"]} /></Field>
                      <Field label="Reasons"><Textarea name="notes" required /></Field>
                    </Step>
                  )}
                  {c.stage === "DECIDED" && <Step id={c.id} step="close" label="Close case" />}
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </>
  );
}
