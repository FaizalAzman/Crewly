import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Field, Input, Textarea } from "@/components/ui";
import { humanize } from "@/lib/constants";
import { fmtDate, rm } from "@/lib/utils";
import { applyAction } from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ jobId: string }> }): Promise<Metadata> {
  const j = await prisma.jobOpening.findUnique({ where: { id: (await params).jobId } });
  return { title: j ? j.title : "Job" };
}

export default async function JobDetailPage({ params }: { params: Promise<{ slug: string; jobId: string }> }) {
  const { slug, jobId } = await params;
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) notFound();
  const job = await prisma.jobOpening.findFirst({ where: { id: jobId, tenantId: tenant.id, status: "OPEN" }, include: { department: true } });
  if (!job) notFound();
  return (
    <div className="bg-dots min-h-screen px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <Link href={`/careers/${slug}`} className="text-sm font-bold underline">← All roles at {tenant.name}</Link>
        <div className="mt-4 rounded-3xl border-2 border-ink bg-card p-7 shadow-brutal-lg">
          <h1 className="font-display text-4xl font-extrabold">{job.title}</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone="gray">{job.department?.name ?? "General"}</Badge>
            <Badge tone="blue">{job.location}</Badge>
            <Badge tone="purple">{humanize(job.workMode)}</Badge>
            <Badge tone="gray">{humanize(job.employmentType)}</Badge>
            {job.salaryMin && <Badge tone="lime">{rm(job.salaryMin, { decimals: 0 })} – {rm(job.salaryMax ?? job.salaryMin, { decimals: 0 })} / month</Badge>}
          </div>
          {job.description && <p className="mt-5 whitespace-pre-wrap text-ink-2">{job.description}</p>}
          {job.closingDate && <p className="mt-4 text-sm font-semibold">Applications close {fmtDate(job.closingDate, "long")}.</p>}
        </div>

        <div className="mt-6 rounded-3xl border-2 border-ink bg-card p-7 shadow-brutal">
          <h2 className="font-display text-2xl font-extrabold">Apply now</h2>
          <ActionForm action={applyAction} className="mt-4 grid gap-4 md:grid-cols-2">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="jobId" value={job.id} />
            <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
            <Field label="Full name" required><Input name="name" required /></Field>
            <Field label="Email" required><Input type="email" name="email" required /></Field>
            <Field label="Phone"><Input name="phone" placeholder="+60 12-345 6789" /></Field>
            <Field label="Expected salary (RM / month)"><Input type="number" name="expectedSalary" /></Field>
            <Field label="Notice period"><Input name="noticePeriod" placeholder="1 month" /></Field>
            <Field label="Résumé" hint="PDF or Word, max 5 MB"><Input type="file" name="resume" accept="application/pdf,.doc,.docx" className="py-1.5" /></Field>
            <Field label="Why you? (optional)" className="md:col-span-2"><Textarea name="coverNote" rows={4} /></Field>
            <p className="text-[11px] text-muted md:col-span-2">
              By applying you agree that {tenant.name} may process your personal data for recruitment purposes, in line with the Personal Data Protection Act 2010.
            </p>
            <SubmitButton className="md:col-span-2" size="lg" pendingText="Sending…">Submit application</SubmitButton>
          </ActionForm>
        </div>
      </div>
    </div>
  );
}
