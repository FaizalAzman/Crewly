import Link from "next/link";
import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { Badge, Card, CardBody, EmptyState, Field, Input, PageHeader, Select, StatCard, StatusBadge, Textarea } from "@/components/ui";
import { ActionButton, FormModal } from "@/components/forms";
import { HBarChart } from "@/components/charts";
import { fmtDate, rm } from "@/lib/utils";
import { humanize } from "@/lib/constants";
import { STAGES } from "@/server/services/talent.service";
import { createJobAction, setJobStatusAction, updateJobAction } from "./actions";
import { LinkButton } from "@/components/ui";

export const metadata: Metadata = { title: "Recruitment" };

export default async function RecruitmentPage() {
  const ctx = await requireCtx("recruitment.manage");
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } });
  const [jobs, depts, candidates] = await Promise.all([
    prisma.jobOpening.findMany({ where: { tenantId: ctx.tenantId }, include: { department: true, candidates: true }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] }),
    prisma.department.findMany({ where: { tenantId: ctx.tenantId } }),
    prisma.candidate.findMany({ where: { tenantId: ctx.tenantId } }),
  ]);
  const open = jobs.filter((j) => j.status === "OPEN");
  const sources = Object.entries(candidates.reduce<Record<string, number>>((a, c) => ({ ...a, [c.source]: (a[c.source] ?? 0) + 1 }), {}))
    .map(([name, value]) => ({ name: humanize(name), value }))
    .sort((a, b) => b.value - a.value);

  return (
    <>
      <PageHeader
        title="Recruitment"
        emoji="🧲"
        subtitle="Job openings, candidate pipeline, interviews and one-click hiring."
        actions={
          <>
          <LinkButton href={`/careers/${tenant.slug}`} variant="secondary" target="_blank">
            🌐 Public careers page
          </LinkButton>
          <FormModal trigger="+ New job" title="New job opening" action={createJobAction} wide>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Job title" className="md:col-span-2">
                <Input name="title" required />
              </Field>
              <Field label="Department">
                <Select name="departmentId" placeholder="—" options={depts.map((d) => ({ value: d.id, label: d.name }))} />
              </Field>
              <Field label="Location">
                <Input name="location" defaultValue="Kuala Lumpur" />
              </Field>
              <Field label="Employment type">
                <Select name="employmentType" options={["PERMANENT", "CONTRACT", "INTERN", "PART_TIME"]} />
              </Field>
              <Field label="Work mode">
                <Select name="workMode" options={["HYBRID", "ONSITE", "REMOTE"]} />
              </Field>
              <Field label="Salary min (RM)">
                <Input type="number" name="salaryMin" />
              </Field>
              <Field label="Salary max (RM)">
                <Input type="number" name="salaryMax" />
              </Field>
              <Field label="Headcount">
                <Input type="number" name="headcount" defaultValue="1" min={1} />
              </Field>
              <Field label="Closing date">
                <Input type="date" name="closingDate" />
              </Field>
              <Field label="Description" className="md:col-span-2">
                <Textarea name="description" rows={4} />
              </Field>
            </div>
          </FormModal>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Open roles" value={open.length} hint={`${open.reduce((s, j) => s + j.headcount, 0)} seats`} tone="lime" emoji="📢" />
        <StatCard label="Active candidates" value={candidates.filter((c) => !["HIRED", "REJECTED"].includes(c.stage)).length} tone="sky" emoji="🧑‍💼" />
        <StatCard label="In interview" value={candidates.filter((c) => c.stage === "INTERVIEW").length} tone="bubblegum" emoji="🎤" />
        <StatCard label="Offers out" value={candidates.filter((c) => c.stage === "OFFER").length} tone="sunny" emoji="📨" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {jobs.length === 0 && (
            <Card>
              <EmptyState emoji="📢" title="No job openings" body="Create a role to start collecting candidates." />
            </Card>
          )}
          {jobs.map((j) => {
            const counts = STAGES.map((s) => j.candidates.filter((c) => c.stage === s).length);
            return (
              <Card key={j.id}>
                <CardBody>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link href={`/recruitment/${j.id}`} className="font-display text-xl font-extrabold hover:underline">
                        {j.title}
                      </Link>
                      <p className="text-xs text-muted">
                        {j.department?.name ?? "No dept"} · {j.location} · {humanize(j.workMode)} · {humanize(j.employmentType)}
                        {j.salaryMin && ` · ${rm(j.salaryMin, { decimals: 0 })}–${rm(j.salaryMax ?? 0, { decimals: 0 })}`}
                        {j.closingDate && ` · closes ${fmtDate(j.closingDate)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={j.status} />
                      <FormModal trigger="Edit" triggerSize="sm" triggerVariant="secondary" title={`Edit ${j.title}`} action={updateJobAction} wide>
                        <input type="hidden" name="id" value={j.id} />
                        <div className="grid gap-3 md:grid-cols-2">
                          <Field label="Job title" className="md:col-span-2"><Input name="title" defaultValue={j.title} required /></Field>
                          <Field label="Department"><Select name="departmentId" defaultValue={j.departmentId ?? ""} placeholder="—" options={depts.map((d) => ({ value: d.id, label: d.name }))} /></Field>
                          <Field label="Location"><Input name="location" defaultValue={j.location} /></Field>
                          <Field label="Employment type"><Select name="employmentType" defaultValue={j.employmentType} options={["PERMANENT", "CONTRACT", "INTERN", "PART_TIME"]} /></Field>
                          <Field label="Work mode"><Select name="workMode" defaultValue={j.workMode} options={["HYBRID", "ONSITE", "REMOTE"]} /></Field>
                          <Field label="Salary min (RM)"><Input type="number" name="salaryMin" defaultValue={j.salaryMin ?? ""} /></Field>
                          <Field label="Salary max (RM)"><Input type="number" name="salaryMax" defaultValue={j.salaryMax ?? ""} /></Field>
                          <Field label="Headcount"><Input type="number" name="headcount" defaultValue={j.headcount} min={1} /></Field>
                          <Field label="Closing date"><Input type="date" name="closingDate" defaultValue={j.closingDate?.toISOString().slice(0, 10) ?? ""} /></Field>
                          <Field label="Description" className="md:col-span-2"><Textarea name="description" rows={5} defaultValue={j.description ?? ""} /></Field>
                        </div>
                      </FormModal>
                      {j.status === "OPEN" ? (
                        <ActionButton action={setJobStatusAction} fields={{ id: j.id, status: "ON_HOLD" }}>Pause</ActionButton>
                      ) : j.status !== "CLOSED" ? (
                        <ActionButton action={setJobStatusAction} fields={{ id: j.id, status: "OPEN" }}>Reopen</ActionButton>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-6 gap-1.5">
                    {STAGES.map((s, i) => (
                      <Link key={s} href={`/recruitment/${j.id}`} className={`rounded-lg border-2 border-ink px-2 py-1.5 text-center ${counts[i] ? "bg-paper" : "bg-paper-2 text-muted"}`}>
                        <p className="font-display text-lg font-extrabold">{counts[i]}</p>
                        <p className="text-[10px] font-bold uppercase">{humanize(s)}</p>
                      </Link>
                    ))}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
        <Card>
          <div className="border-b-2 border-ink px-5 py-3.5">
            <h3 className="font-display text-lg font-bold">🔗 Candidate sources</h3>
            <p className="text-xs text-muted">Where applicants come from</p>
          </div>
          <CardBody>
            <HBarChart data={sources} height={Math.max(180, sources.length * 32)} />
            <div className="mt-3 flex flex-wrap gap-1">
              {["JobStreet", "Hiredly", "LinkedIn", "MauKerja", "Referral"].map((s) => (
                <Badge key={s} tone="gray">{s}</Badge>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
