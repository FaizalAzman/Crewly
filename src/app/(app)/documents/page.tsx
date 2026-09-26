import Link from "next/link";
import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { Badge, Card, CardBody, CardHeader, Checkbox, EmptyState, Field, Input, PageHeader, PersonCell, Progress, Select, StatusBadge, Table, Tabs, TD, TH, THead, TR, Textarea } from "@/components/ui";
import { ActionButton, FormModal } from "@/components/forms";
import { fmtDate, todayMY } from "@/lib/utils";
import { humanize } from "@/lib/constants";
import { deleteLetterAction, generateAction, issueLetterAction, letterheadAction, policyAction, templateAction, updateLetterAction } from "./actions";
import { LetterDocument } from "@/components/letter-document";
import { ActionForm, SubmitButton } from "@/components/forms";

export const metadata: Metadata = { title: "Letters & policies" };

const FIELDS = ["employee.fullName", "employee.preferredName", "employee.employeeNo", "employee.icNo", "employee.jobTitle", "employee.department", "employee.basicSalary", "employee.joinDate", "employee.confirmationDate", "employee.lastWorkingDate", "employee.address", "employee.probationMonths", "company.name", "company.address", "company.regNo", "today", "signatory", "effectiveDate"];

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string }> }) {
  const ctx = await requireCtx("documents.manage");
  const sp = await searchParams;
  const tab = sp.tab ?? "letters";
  const status = sp.status ?? "ALL";
  const [templates, letters, emps, policies, headcount] = await Promise.all([
    prisma.letterTemplate.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { name: "asc" } }),
    prisma.generatedLetter.findMany({ where: { tenantId: ctx.tenantId, ...(status !== "ALL" ? { status } : {}) }, include: { employee: true }, orderBy: { createdAt: "desc" }, take: 100 }),
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
  const policyForm = (p?: (typeof policies)[number]) => (
    <>
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Title" className="col-span-2"><Input name="title" defaultValue={p?.title} required /></Field>
        <Field label="Version" hint={p ? "Bump it when the content changes" : undefined}><Input name="version" defaultValue={p?.version ?? "1.0"} /></Field>
      </div>
      <Field label="Category"><Select name="category" defaultValue={p?.category} options={["GENERAL", "COMPLIANCE", "IT", "SAFETY", "BENEFITS"]} /></Field>
      <Field label="Content"><Textarea name="content" rows={8} defaultValue={p?.content} required /></Field>
      <Checkbox name="requiresAck" label="Require acknowledgement from all employees" defaultChecked={p?.requiresAck ?? true} />
    </>
  );
  const companies = tab === "letterhead" ? await prisma.company.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { isDefault: "desc" } }) : [];
  const counts = await prisma.generatedLetter.groupBy({ by: ["status"], where: { tenantId: ctx.tenantId }, _count: true });
  const n = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;

  return (
    <>
      <PageHeader
        title="Letters & policies"
        emoji="✉️"
        subtitle="Generate letters from templates, review drafts, issue them to employees, and track acknowledgements."
        actions={
          <FormModal trigger="Generate letter" title="Generate a letter" subtitle="Creates a draft you can review and edit before issuing." action={generateAction}>
            <Field label="Template"><Select name="templateId" options={templates.map((t) => ({ value: t.id, label: t.name }))} /></Field>
            <Field label="Employee"><Select name="employeeId" options={emps.map((e) => ({ value: e.id, label: `${e.fullName} (${e.employeeNo})` }))} /></Field>
            <Field label="Effective date" hint="Fills {{effectiveDate}} (increments, confirmations and so on)"><Input type="date" name="effectiveDate" defaultValue={todayMY().toISOString().slice(0, 10)} /></Field>
            <Checkbox name="issueNow" label="Issue immediately (skip draft review)" />
          </FormModal>
        }
      />
      <Tabs active={tab} tabs={[{ key: "letters", label: "Letters", href: "/documents?tab=letters", count: n("DRAFT") }, { key: "templates", label: "Templates", href: "/documents?tab=templates" }, { key: "policies", label: "Policies", href: "/documents?tab=policies" }, { key: "letterhead", label: "Letterhead", href: "/documents?tab=letterhead" }]} />

      {tab === "letterhead" && (
        <div className="space-y-8">
          {companies.map((c) => (
            <div key={c.id} className="grid gap-6 xl:grid-cols-[420px_1fr]">
              <Card>
                <CardHeader title={c.name} emoji="🏷️" subtitle="Applies to every letter, payslip and PDF issued under this entity" />
                <CardBody>
                  <ActionForm action={letterheadAction} resetOnSuccess={false} className="space-y-3">
                    <input type="hidden" name="companyId" value={c.id} />
                    <Field label="Logo" hint={c.letterheadLogo ? "Uploading replaces the current logo" : "PNG or JPEG, ideally a wide logo on a transparent background"}>
                      <Input type="file" name="logo" accept="image/png,image/jpeg" className="py-1.5" />
                    </Field>
                    {c.letterheadLogo && <Checkbox name="removeLogo" label="Remove current logo" />}
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Accent colour"><Input type="color" name="letterheadColor" defaultValue={c.letterheadColor} className="p-1" /></Field>
                      <Field label="Layout"><Select name="letterheadLayout" defaultValue={c.letterheadLayout} options={[{ value: "LEFT", label: "Logo left" }, { value: "CENTER", label: "Centred" }, { value: "RIGHT", label: "Logo right" }]} /></Field>
                    </div>
                    <Field label="Contact line" hint="Shown under the address"><Input name="letterheadContact" defaultValue={c.letterheadContact ?? ""} placeholder="hr@company.my · www.company.my" /></Field>
                    <Field label="Footer" hint="e.g. registered office or a confidentiality notice"><Textarea name="letterheadFooter" rows={2} defaultValue={c.letterheadFooter ?? ""} /></Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Default signatory"><Input name="signatoryName" defaultValue={c.signatoryName ?? ""} placeholder="Aisyah binti Rahman" /></Field>
                      <Field label="Signatory title"><Input name="signatoryTitle" defaultValue={c.signatoryTitle ?? ""} placeholder="Head of People" /></Field>
                    </div>
                    <Field label="Signature image" hint="Optional. Placed where a template has a [signature] line."><Input type="file" name="signature" accept="image/png,image/jpeg" className="py-1.5" /></Field>
                    {c.signatureImage && <Checkbox name="removeSignature" label="Remove current signature" />}
                    <SubmitButton className="w-full">Save letterhead</SubmitButton>
                  </ActionForm>
                </CardBody>
              </Card>
              <div className="origin-top scale-[0.85]">
                <LetterDocument
                  company={c}
                  content={`26 September 2026\n\nNur Hana binti Aziz\nProduct Manager\n\nDear Hana,\n\nSAMPLE LETTER\n\nThis is a preview of how letters issued by ${c.name} will look, including the letterhead, footer and signature block.\n\nYours sincerely,\n\n[signature]\n${c.signatoryName ?? "Signatory name"}\n${c.signatoryTitle ?? "Title"}\n${c.name}`}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "letters" && (
        <Card>
          <div className="flex flex-wrap gap-2 border-b-2 border-ink p-3">
            {[["ALL", "All", n("DRAFT") + n("ISSUED") + n("ACKNOWLEDGED")], ["DRAFT", "Drafts", n("DRAFT")], ["ISSUED", "Awaiting acknowledgement", n("ISSUED")], ["ACKNOWLEDGED", "Acknowledged", n("ACKNOWLEDGED")]].map(([k, l, c]) => (
              <Link key={k} href={`/documents?tab=letters&status=${k}`} className={`rounded-full border-2 border-ink px-3 py-1 text-xs font-bold ${status === k ? "bg-ink text-paper" : "bg-card"}`}>
                {l} <span className="opacity-60">{c}</span>
              </Link>
            ))}
          </div>
          {letters.length === 0 ? (
            <EmptyState emoji="✉️" title="No letters here" body="Generate one from a template above." />
          ) : (
            <Table>
              <THead><tr><TH>Letter</TH><TH>Employee</TH><TH>Status</TH><TH>Dates</TH><TH /></tr></THead>
              <tbody>
                {letters.map((l) => (
                  <TR key={l.id}>
                    <TD className="font-semibold">{l.title.split(" — ")[0]}</TD>
                    <TD><PersonCell name={l.employee.fullName} sub={l.employee.employeeNo} color={l.employee.avatarColor} /></TD>
                    <TD><StatusBadge status={l.status === "DRAFT" ? "DRAFT" : l.status === "ISSUED" ? "WAITING" : "COMPLETED"} /> <span className="text-[10px] font-bold">{humanize(l.status)}</span></TD>
                    <TD className="text-xs">
                      Created {fmtDate(l.createdAt)}
                      {l.issuedAt && <span className="block">Issued {fmtDate(l.issuedAt)} by {l.issuedBy}</span>}
                      {l.acknowledgedAt && <span className="block">Ack&apos;d {fmtDate(l.acknowledgedAt)}</span>}
                    </TD>
                    <TD>
                      <div className="flex flex-wrap justify-end gap-1">
                        <Link href={`/documents/letters/${l.id}`} className="rounded-lg border-2 border-ink bg-card px-2 py-1 text-xs font-bold">Open</Link>
                        <a href={`/api/pdf/letter/${l.id}`} className="rounded-lg border-2 border-ink bg-card px-2 py-1 text-xs font-bold">PDF</a>
                        {l.status === "DRAFT" && (
                          <>
                            <FormModal trigger="Edit" triggerSize="sm" triggerVariant="secondary" title={`Edit draft · ${l.employee.fullName}`} action={updateLetterAction} wide>
                              <input type="hidden" name="id" value={l.id} />
                              <Field label="Title"><Input name="title" defaultValue={l.title} /></Field>
                              <Field label="Letter" hint="Replace any [Describe …] or [missing: …] placeholders before issuing.">
                                <Textarea name="content" defaultValue={l.content} rows={18} className="font-mono text-xs" />
                              </Field>
                            </FormModal>
                            <ActionButton action={issueLetterAction} fields={{ id: l.id }} variant="lime" confirm={`Issue this letter to ${l.employee.fullName}? It can't be edited afterwards.`}>Issue</ActionButton>
                            <ActionButton action={deleteLetterAction} fields={{ id: l.id }} variant="ghost" confirm="Delete this draft?">Delete</ActionButton>
                          </>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
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
            <FormModal trigger="+ Publish policy" title="Publish policy" action={policyAction} wide>{policyForm()}</FormModal>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {policies.map((p) => (
              <Card key={p.id}>
                <CardHeader
                  title={p.title}
                  emoji="📜"
                  subtitle={`v${p.version} · ${humanize(p.category)} · published ${fmtDate(p.publishedAt)}`}
                  action={<FormModal trigger="Edit / new version" triggerSize="sm" triggerVariant="secondary" title={`Edit ${p.title}`} subtitle="Changing the content requires a new version number and resets acknowledgements." action={policyAction} wide>{policyForm(p)}</FormModal>}
                />
                <CardBody className="space-y-3">
                  <p className="whitespace-pre-wrap text-sm text-ink-2">{p.content}</p>
                  {p.requiresAck ? (
                    <div>
                      <p className="mb-1 text-xs font-bold">Acknowledged by {p._count.acknowledgements} of {headcount}</p>
                      <Progress value={(p._count.acknowledgements / Math.max(1, headcount)) * 100} tone="bg-mint" />
                    </div>
                  ) : (
                    <Badge tone="gray">For information only</Badge>
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
