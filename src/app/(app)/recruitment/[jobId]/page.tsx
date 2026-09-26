import { notFound } from "next/navigation";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { Badge, Callout, Field, Input, LinkButton, PageHeader, Select, Textarea } from "@/components/ui";
import { ActionButton, FormModal } from "@/components/forms";
import { fmtDate, rm, todayMY } from "@/lib/utils";
import { CITIZENSHIP, humanize } from "@/lib/constants";
import { STAGES, canMoveStage, type Stage } from "@/server/services/talent.service";
import { addCandidateAction, candidateNotesAction, hireAction, interviewAction, moveCandidateAction, scoreAction } from "../actions";
import { Modal } from "@/components/forms";
import { Attachment } from "@/components/attachment";
import { ActionForm, SubmitButton } from "@/components/forms";

const COLORS: Record<string, string> = { APPLIED: "bg-paper-2", SCREENING: "bg-sky/30", INTERVIEW: "bg-grape/20", OFFER: "bg-bubblegum/40", HIRED: "bg-mint/40", REJECTED: "bg-cherry/10" };

export default async function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const ctx = await requireCtx("recruitment.manage");
  const { jobId } = await params;
  const job = await prisma.jobOpening.findFirst({
    where: { id: jobId, tenantId: ctx.tenantId },
    include: { department: true, candidates: { include: { interviews: { orderBy: { scheduledAt: "desc" } } }, orderBy: { rating: "desc" } } },
  });
  if (!job) notFound();
  const [companies, branches, managers] = await Promise.all([
    prisma.company.findMany({ where: { tenantId: ctx.tenantId } }),
    prisma.branch.findMany({ where: { tenantId: ctx.tenantId } }),
    prisma.employee.findMany({ where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROBATION"] } }, orderBy: { fullName: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        kicker={job.department?.name ?? "Recruitment"}
        title={job.title}
        emoji="📢"
        subtitle={`${job.location} · ${humanize(job.workMode)} · ${job.headcount} seat(s)${job.salaryMin ? ` · ${rm(job.salaryMin, { decimals: 0 })} – ${rm(job.salaryMax ?? 0, { decimals: 0 })}` : ""}`}
        actions={
          <>
            <LinkButton href="/recruitment" variant="secondary">← All jobs</LinkButton>
            <FormModal trigger="+ Candidate" title="Add candidate" action={addCandidateAction}>
              <input type="hidden" name="jobId" value={job.id} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name" className="col-span-2">
                  <Input name="name" required />
                </Field>
                <Field label="Email">
                  <Input type="email" name="email" required />
                </Field>
                <Field label="Phone">
                  <Input name="phone" />
                </Field>
                <Field label="Source">
                  <Select name="source" options={["LINKEDIN", "JOBSTREET", "HIREDLY", "MAUKERJA", "REFERRAL", "CAREERS_PAGE", "OTHER"]} />
                </Field>
                <Field label="Expected salary">
                  <Input type="number" name="expectedSalary" />
                </Field>
                <Field label="Current company">
                  <Input name="currentCompany" />
                </Field>
                <Field label="Notice period">
                  <Input name="noticePeriod" placeholder="1 month" />
                </Field>
              </div>
              <Field label="Notes">
                <Textarea name="notes" />
              </Field>
              <Field label="Résumé" hint="PDF or Word, max 5 MB">
                <Input type="file" name="resumeFile" accept="application/pdf,.doc,.docx" className="py-1.5" />
              </Field>
            </FormModal>
          </>
        }
      />
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => {
          const cards = job.candidates.filter((c) => c.stage === stage);
          return (
            <div key={stage} className={`w-72 shrink-0 rounded-2xl border-2 border-ink p-3 ${COLORS[stage]}`}>
              <p className="mb-3 flex items-center justify-between font-display font-bold">
                {humanize(stage)} <Badge tone="ink">{cards.length}</Badge>
              </p>
              <div className="space-y-3">
                {cards.map((c) => (
                  <div key={c.id} className="rounded-xl border-2 border-ink bg-card p-3 shadow-brutal-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-bold">{c.name}</p>
                        <p className="truncate text-[11px] text-muted">{c.email}</p>
                      </div>
                      <span className="shrink-0 text-xs">{"★".repeat(c.rating)}{"☆".repeat(5 - c.rating)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge tone="gray">{humanize(c.source)}</Badge>
                      {c.expectedSalary && <Badge tone="yellow">{rm(c.expectedSalary, { decimals: 0 })}</Badge>}
                      {c.noticePeriod && <Badge tone="blue">{c.noticePeriod}</Badge>}
                    </div>
                    {c.currentCompany && c.currentCompany !== "-" && <p className="mt-1 text-[11px] text-ink-2">Now at {c.currentCompany}</p>}
                    {c.interviews[0] && (
                      <p className="mt-1 text-[11px] text-ink-2">
                        🎤 {fmtDate(c.interviews[0].scheduledAt)} · {c.interviews[0].interviewer}
                        {c.interviews[0].score ? ` · ${c.interviews[0].score}/5` : ""}
                      </p>
                    )}
                    {c.resumeUrl && (
                      <p className="mt-1 text-[11px]">
                        <Attachment value={c.resumeUrl} label="Résumé" />
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-1">
                      <Modal trigger="Details" triggerSize="sm" triggerVariant="secondary" title={c.name} subtitle={`${c.email}${c.phone ? ` · ${c.phone}` : ""}`} wide>
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                            <p><span className="block text-[10px] font-bold uppercase text-muted">Stage</span>{humanize(c.stage)}</p>
                            <p><span className="block text-[10px] font-bold uppercase text-muted">Source</span>{humanize(c.source)}</p>
                            <p><span className="block text-[10px] font-bold uppercase text-muted">Current company</span>{c.currentCompany ?? "-"}</p>
                            <p><span className="block text-[10px] font-bold uppercase text-muted">Notice</span>{c.noticePeriod ?? "-"}</p>
                          </div>
                          <div>
                            <p className="mb-1 text-xs font-bold uppercase text-muted">Interviews</p>
                            {c.interviews.length === 0 && <p className="text-sm text-muted">None yet.</p>}
                            {c.interviews.map((iv) => (
                              <div key={iv.id} className="mb-2 rounded-xl border-2 border-soft-line p-2 text-sm">
                                <b>{fmtDate(iv.scheduledAt)}</b> · {humanize(iv.mode)} · {iv.interviewer}
                                {iv.score != null && <> · <b>{iv.score}/5</b> {iv.recommendation && humanize(iv.recommendation)}</>}
                                {iv.feedback && <p className="text-xs text-ink-2">{iv.feedback}</p>}
                              </div>
                            ))}
                          </div>
                          <ActionForm action={candidateNotesAction} resetOnSuccess={false} className="space-y-3">
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="jobId" value={job.id} />
                            <Field label="Notes"><Textarea name="notes" defaultValue={c.notes ?? ""} rows={4} /></Field>
                            <div className="grid grid-cols-2 gap-3">
                              <Field label="Expected salary (RM)"><Input type="number" name="expectedSalary" defaultValue={c.expectedSalary ?? ""} /></Field>
                              <Field label={c.resumeUrl ? "Replace résumé" : "Upload résumé"}><Input type="file" name="resumeFile" accept="application/pdf,.doc,.docx" className="py-1.5" /></Field>
                            </div>
                            <SubmitButton size="sm">Save</SubmitButton>
                          </ActionForm>
                        </div>
                      </Modal>
                      {STAGES.filter((s) => s !== "HIRED" && canMoveStage(c.stage as Stage, s) && Math.abs(STAGES.indexOf(s) - STAGES.indexOf(c.stage as Stage)) === 1).map((s) => (
                        <ActionButton key={s} action={moveCandidateAction} fields={{ id: c.id, stage: s, jobId: job.id }} size="sm" variant={STAGES.indexOf(s) > STAGES.indexOf(c.stage as Stage) ? "lime" : "secondary"}>
                          {STAGES.indexOf(s) > STAGES.indexOf(c.stage as Stage) ? `→ ${humanize(s)}` : `← ${humanize(s)}`}
                        </ActionButton>
                      ))}
                      {!["HIRED", "REJECTED"].includes(c.stage) && (
                        <ActionButton action={moveCandidateAction} fields={{ id: c.id, stage: "REJECTED", jobId: job.id }} size="sm" variant="ghost" confirm={`Reject ${c.name}?`}>
                          ✕
                        </ActionButton>
                      )}
                      {c.stage === "REJECTED" && (
                        <ActionButton action={moveCandidateAction} fields={{ id: c.id, stage: "SCREENING", jobId: job.id }} size="sm">
                          Revive
                        </ActionButton>
                      )}
                      {!["HIRED", "REJECTED"].includes(c.stage) && (
                        <FormModal trigger="🎤" triggerSize="sm" triggerVariant="secondary" title={`Interview · ${c.name}`} action={interviewAction}>
                          <input type="hidden" name="candidateId" value={c.id} />
                          <input type="hidden" name="jobId" value={job.id} />
                          <Field label="Date & time">
                            <Input type="datetime-local" name="scheduledAt" required />
                          </Field>
                          <Field label="Mode">
                            <Select name="mode" options={["VIDEO", "ONSITE", "PHONE"]} />
                          </Field>
                          <Field label="Interviewer">
                            <Input name="interviewer" required />
                          </Field>
                        </FormModal>
                      )}
                      {c.interviews.find((i) => i.score == null) && (
                        <FormModal trigger="📝" triggerSize="sm" triggerVariant="secondary" title={`Scorecard · ${c.name}`} action={scoreAction}>
                          <input type="hidden" name="id" value={c.interviews.find((i) => i.score == null)!.id} />
                          <input type="hidden" name="jobId" value={job.id} />
                          <Field label="Score (1–5)">
                            <Select name="score" defaultValue="3" options={["1", "2", "3", "4", "5"]} />
                          </Field>
                          <Field label="Recommendation">
                            <Select name="recommendation" options={["STRONG_HIRE", "HIRE", "NO_HIRE"]} />
                          </Field>
                          <Field label="Feedback">
                            <Textarea name="feedback" required />
                          </Field>
                        </FormModal>
                      )}
                      {c.stage === "OFFER" && (
                        <FormModal trigger="🎉 Hire" triggerSize="sm" triggerVariant="grape" title={`Hire ${c.name}`} subtitle="Creates the employee record, leave balances and onboarding checklist." action={hireAction} wide>
                          <input type="hidden" name="candidateId" value={c.id} />
                          <div className="grid gap-3 md:grid-cols-2">
                            <Field label="Full name (as per IC)">
                              <Input name="fullName" defaultValue={c.name} required />
                            </Field>
                            <Field label="Work email">
                              <Input name="email" type="email" defaultValue={c.email} required />
                            </Field>
                            <Field label="Citizenship">
                              <Select name="citizenship" options={[...CITIZENSHIP]} />
                            </Field>
                            <Field label="NRIC / passport">
                              <Input name="icNo" placeholder="NRIC for citizens" />
                            </Field>
                            <Field label="Passport (foreigners)">
                              <Input name="passportNo" />
                            </Field>
                            <Field label="Job title">
                              <Input name="jobTitle" defaultValue={job.title} required />
                            </Field>
                            <Field label="Basic salary (RM)">
                              <Input name="basicSalary" type="number" defaultValue={c.expectedSalary ?? job.salaryMin ?? ""} required />
                            </Field>
                            <Field label="Join date">
                              <Input name="joinDate" type="date" defaultValue={todayMY().toISOString().slice(0, 10)} required />
                            </Field>
                            <Field label="Employment type">
                              <Select name="employmentType" defaultValue={job.employmentType} options={["PERMANENT", "CONTRACT", "PROBATION", "INTERN", "PART_TIME"]} />
                            </Field>
                            <Field label="Probation (months)">
                              <Input name="probationMonths" type="number" defaultValue="3" />
                            </Field>
                            <Field label="Legal entity">
                              <Select name="companyId" options={companies.map((x) => ({ value: x.id, label: x.name }))} />
                            </Field>
                            <Field label="Branch">
                              <Select name="branchId" placeholder="—" options={branches.map((x) => ({ value: x.id, label: x.name }))} />
                            </Field>
                            <Field label="Reports to">
                              <Select name="managerId" placeholder="—" options={managers.map((m) => ({ value: m.id, label: m.fullName }))} />
                            </Field>
                          </div>
                          <Callout emoji="📌">Remember: submit CP22 to LHDN and register with KWSP and PERKESO within 30 days. These are added to the onboarding checklist.</Callout>
                        </FormModal>
                      )}
                    </div>
                  </div>
                ))}
                {cards.length === 0 && <p className="py-4 text-center text-xs text-muted">Empty</p>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
