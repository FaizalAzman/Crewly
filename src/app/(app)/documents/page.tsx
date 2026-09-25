import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { Badge, Card, CardBody, CardHeader, Checkbox, Field, Input, PageHeader, Progress, Select, Table, Tabs, TD, TH, THead, TR, Textarea } from "@/components/ui";
import { FormModal, Modal } from "@/components/forms";
import { act } from "@/server/action";
import { generateLetter } from "@/server/services/culture.service";
import { boolField, fmtDate, optStr, str } from "@/lib/utils";
import { humanize } from "@/lib/constants";
import { DomainError, type ActionState } from "@/server/types";

export const metadata: Metadata = { title: "Letters & policies" };

async function generateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("documents.manage");
  return act(async () => {
    await generateLetter(ctx, str(fd, "templateId"), str(fd, "employeeId"));
    revalidatePath("/documents");
    return "Letter generated ✉️";
  });
}

async function templateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("documents.manage");
  return act(async () => {
    const id = optStr(fd, "id");
    const data = { name: str(fd, "name"), category: str(fd, "category"), body: str(fd, "body") };
    if (!data.name || !data.body) throw new DomainError("Name and body are required.");
    if (id) await prisma.letterTemplate.update({ where: { id, tenantId: ctx.tenantId }, data });
    else await prisma.letterTemplate.create({ data: { ...data, tenantId: ctx.tenantId } });
    revalidatePath("/documents");
    return "Template saved";
  });
}

async function policyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("documents.manage");
  return act(async () => {
    await prisma.policy.create({ data: { tenantId: ctx.tenantId, title: str(fd, "title"), category: str(fd, "category"), content: str(fd, "content"), version: str(fd, "version") || "1.0", requiresAck: boolField(fd, "requiresAck") } });
    revalidatePath("/documents");
    return "Policy published. Employees will be asked to acknowledge it.";
  });
}

const FIELDS = ["employee.fullName", "employee.preferredName", "employee.employeeNo", "employee.icNo", "employee.jobTitle", "employee.department", "employee.basicSalary", "employee.joinDate", "employee.confirmationDate", "employee.lastWorkingDate", "employee.address", "employee.probationMonths", "company.name", "company.address", "company.regNo", "today", "signatory", "effectiveDate"];

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requireCtx("documents.manage");
  const tab = (await searchParams).tab ?? "letters";
  const [templates, letters, emps, policies, headcount] = await Promise.all([
    prisma.letterTemplate.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { name: "asc" } }),
    prisma.generatedLetter.findMany({ where: { tenantId: ctx.tenantId }, include: { employee: true }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.employee.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { fullName: "asc" } }),
    prisma.policy.findMany({ where: { tenantId: ctx.tenantId }, include: { _count: { select: { acknowledgements: true } } }, orderBy: { publishedAt: "desc" } }),
    prisma.employee.count({ where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROBATION", "NOTICE"] } } }),
  ]);
  const tplForm = (t?: (typeof templates)[number]) => (
    <>
      {t && <input type="hidden" name="id" value={t.id} />}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name"><Input name="name" defaultValue={t?.name} required /></Field>
        <Field label="Category"><Select name="category" defaultValue={t?.category} options={["OFFER", "CONFIRMATION", "INCREMENT", "PROMOTION", "WARNING", "SHOW_CAUSE", "EXPERIENCE", "TERMINATION", "OTHER"]} /></Field>
      </div>
      <Field label="Body" hint={<>Merge fields: {FIELDS.map((f) => <code key={f} className="mr-1">{`{{${f}}}`}</code>)}</>}>
        <Textarea name="body" defaultValue={t?.body} rows={14} className="font-mono text-xs" required />
      </Field>
    </>
  );
  return (
    <>
      <PageHeader
        title="Letters & policies"
        emoji="✉️"
        subtitle="HR letter templates with merge fields, and company policies that employees acknowledge electronically."
        actions={
          <FormModal trigger="Generate letter" title="Generate a letter" action={generateAction}>
            <Field label="Template"><Select name="templateId" options={templates.map((t) => ({ value: t.id, label: t.name }))} /></Field>
            <Field label="Employee"><Select name="employeeId" options={emps.map((e) => ({ value: e.id, label: e.fullName }))} /></Field>
          </FormModal>
        }
      />
      <Tabs active={tab} tabs={[{ key: "letters", label: "Generated letters", href: "/documents?tab=letters" }, { key: "templates", label: "Templates", href: "/documents?tab=templates" }, { key: "policies", label: "Policies", href: "/documents?tab=policies" }]} />
      {tab === "letters" && (
        <Card>
          <Table>
            <THead><tr><TH>Letter</TH><TH>Employee</TH><TH>Created</TH><TH /></tr></THead>
            <tbody>
              {letters.map((l) => (
                <TR key={l.id}>
                  <TD className="font-semibold">{l.title}</TD>
                  <TD>{l.employee.fullName}</TD>
                  <TD className="text-xs">{fmtDate(l.createdAt)}</TD>
                  <TD className="text-right">
                    <Modal trigger="View" triggerSize="sm" triggerVariant="secondary" title={l.title} wide>
                      <pre className="whitespace-pre-wrap rounded-xl border-2 border-ink bg-card p-6 font-sans text-sm leading-relaxed">{l.content}</pre>
                    </Modal>
                  </TD>
                </TR>
              ))}
              {letters.length === 0 && <TR><TD colSpan={4} className="text-sm text-muted">No letters yet.</TD></TR>}
            </tbody>
          </Table>
        </Card>
      )}
      {tab === "templates" && (
        <div className="space-y-4">
          <div className="flex justify-end"><FormModal trigger="+ Template" title="New template" action={templateAction} wide>{tplForm()}</FormModal></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {templates.map((t) => (
              <Card key={t.id}>
                <CardHeader title={t.name} emoji="📄" subtitle={humanize(t.category)} action={<FormModal trigger="Edit" triggerSize="sm" triggerVariant="secondary" title={`Edit ${t.name}`} action={templateAction} wide>{tplForm(t)}</FormModal>} />
                <CardBody><p className="line-clamp-6 whitespace-pre-wrap font-mono text-[11px] text-ink-2">{t.body}</p></CardBody>
              </Card>
            ))}
          </div>
        </div>
      )}
      {tab === "policies" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <FormModal trigger="+ Publish policy" title="Publish policy" action={policyAction} wide>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Title" className="col-span-2"><Input name="title" required /></Field>
                <Field label="Version"><Input name="version" defaultValue="1.0" /></Field>
              </div>
              <Field label="Category"><Select name="category" options={["GENERAL", "COMPLIANCE", "IT", "SAFETY", "BENEFITS"]} /></Field>
              <Field label="Content"><Textarea name="content" rows={8} required /></Field>
              <Checkbox name="requiresAck" label="Require acknowledgement from all employees" defaultChecked />
            </FormModal>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {policies.map((p) => (
              <Card key={p.id}>
                <CardHeader title={p.title} emoji="📜" subtitle={`v${p.version} · ${humanize(p.category)} · published ${fmtDate(p.publishedAt)}`} action={p.requiresAck ? <Badge tone="purple">Ack required</Badge> : null} />
                <CardBody className="space-y-3">
                  <p className="text-sm text-ink-2">{p.content}</p>
                  {p.requiresAck && (
                    <div>
                      <p className="mb-1 text-xs font-bold">Acknowledged by {p._count.acknowledgements} of {headcount}</p>
                      <Progress value={(p._count.acknowledgements / Math.max(1, headcount)) * 100} tone="bg-mint" />
                    </div>
                  )}
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
