import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { Badge, Callout, Card, CardBody, CardHeader, Checkbox, Field, Input, PageHeader, Progress, Select, StatCard, StatusBadge } from "@/components/ui";
import { ActionButton, FormModal } from "@/components/forms";
import { act } from "@/server/action";
import { completeEnrollment, createProgram, enroll, hrdLevyBalance } from "@/server/services/talent.service";
import { boolField, dateField, fmtDate, numField, rm, str, todayMY } from "@/lib/utils";
import { humanize } from "@/lib/constants";
import type { ActionState } from "@/server/types";

export const metadata: Metadata = { title: "Training & HRD Corp" };

async function programAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("training.manage");
  return act(async () => {
    await createProgram(ctx, { title: str(fd, "title"), provider: str(fd, "provider"), category: str(fd, "category"), mode: str(fd, "mode"), startDate: dateField(fd, "startDate") as Date, endDate: dateField(fd, "endDate") as Date, hours: numField(fd, "hours", 8), costPerPax: numField(fd, "costPerPax"), capacity: numField(fd, "capacity", 20), hrdClaimable: boolField(fd, "hrdClaimable") });
    revalidatePath("/training");
    return "Programme created";
  });
}

async function enrollOtherAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("training.manage");
  return act(async () => {
    await enroll(ctx, str(fd, "programId"), str(fd, "employeeId"));
    revalidatePath("/training");
    return "Enrolled";
  });
}

async function statusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("training.manage");
  return act(async () => {
    if (str(fd, "enrollmentId")) await completeEnrollment(ctx, str(fd, "enrollmentId"), str(fd, "status") as "COMPLETED");
    if (str(fd, "programId")) {
      const data: Record<string, string> = {};
      if (str(fd, "hrdClaimStatus")) data.hrdClaimStatus = str(fd, "hrdClaimStatus");
      if (str(fd, "programStatus")) data.status = str(fd, "programStatus");
      await prisma.trainingProgram.update({ where: { id: str(fd, "programId"), tenantId: ctx.tenantId }, data });
    }
    revalidatePath("/training");
    return "Updated";
  });
}

export default async function TrainingPage() {
  const ctx = await requireCtx("training.manage");
  const year = todayMY().getUTCFullYear();
  const [programs, emps, levy] = await Promise.all([
    prisma.trainingProgram.findMany({ where: { tenantId: ctx.tenantId }, include: { enrollments: { include: { employee: true } } }, orderBy: { startDate: "desc" } }),
    prisma.employee.findMany({ where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROBATION", "NOTICE"] } }, orderBy: { fullName: "asc" } }),
    hrdLevyBalance(ctx.tenantId, year),
  ]);
  const hours = programs.filter((p) => p.startDate.getUTCFullYear() === year).reduce((s, p) => s + p.hours * p.enrollments.filter((e) => ["COMPLETED", "ATTENDED"].includes(e.status)).length, 0);
  return (
    <>
      <PageHeader
        title="Training & HRD Corp"
        emoji="🎓"
        subtitle="Programmes, enrolments and completion, with HRD Corp levy utilisation."
        actions={
          <FormModal trigger="+ Programme" title="New training programme" action={programAction} wide>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Title" className="md:col-span-2"><Input name="title" required /></Field>
              <Field label="Provider"><Input name="provider" required /></Field>
              <Field label="Category"><Select name="category" options={["TECHNICAL", "SOFT_SKILLS", "COMPLIANCE", "LEADERSHIP", "SAFETY"]} /></Field>
              <Field label="Mode"><Select name="mode" options={["CLASSROOM", "ONLINE", "HYBRID"]} /></Field>
              <Field label="Hours"><Input type="number" name="hours" defaultValue="8" /></Field>
              <Field label="Start"><Input type="date" name="startDate" required /></Field>
              <Field label="End"><Input type="date" name="endDate" required /></Field>
              <Field label="Cost per pax (RM)"><Input type="number" name="costPerPax" /></Field>
              <Field label="Capacity"><Input type="number" name="capacity" defaultValue="20" /></Field>
            </div>
            <Checkbox name="hrdClaimable" label="HRD Corp claimable (SBL-Khas / training grant)" />
          </FormModal>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label={`HRD levy paid ${year}`} value={rm(levy.contributed, { decimals: 0 })} tone="lime" emoji="🏛️" />
        <StatCard label="Levy utilised" value={rm(levy.utilised, { decimals: 0 })} tone="sky" emoji="🎯" />
        <StatCard label="Unutilised levy" value={rm(levy.balance, { decimals: 0 })} hint="Use it or lose it" tone={levy.balance > 0 ? "sunny" : "white"} emoji="⌛" />
        <StatCard label="Training hours" value={hours} tone="bubblegum" emoji="📚" />
      </div>
      {levy.balance > 0 && (
        <div className="mb-6">
          <Callout emoji="💡">You have <b>{rm(levy.balance, { decimals: 0 })}</b> of HRD Corp levy available for claimable training. Levy balances expire, so plan programmes early.</Callout>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        {programs.map((p) => {
          const taken = p.enrollments.length;
          return (
            <Card key={p.id}>
              <CardHeader
                title={p.title}
                emoji={{ TECHNICAL: "💻", SOFT_SKILLS: "🗣️", COMPLIANCE: "📜", LEADERSHIP: "🧭", SAFETY: "🦺" }[p.category] ?? "🎓"}
                subtitle={`${p.provider} · ${humanize(p.mode)} · ${fmtDate(p.startDate)} – ${fmtDate(p.endDate)} · ${p.hours}h`}
                action={<StatusBadge status={p.status} />}
              />
              <CardBody className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge tone="gray">{rm(p.costPerPax, { decimals: 0 })} / pax</Badge>
                  {p.hrdClaimable ? <Badge tone="purple">HRD Corp · {humanize(p.hrdClaimStatus)}</Badge> : <Badge tone="gray">Not claimable</Badge>}
                  {p.hrdGrantNo && <span className="font-mono text-muted">{p.hrdGrantNo}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <Progress value={(taken / p.capacity) * 100} tone="bg-sky" />
                  <span className="font-mono text-xs">{taken}/{p.capacity}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {p.enrollments.map((e) => (
                    <span key={e.id} className="inline-flex items-center gap-1 rounded-full border-2 border-ink bg-paper px-2 py-0.5 text-xs">
                      {e.employee.preferredName ?? e.employee.fullName}
                      {e.status === "COMPLETED" ? " ✅" : e.status === "NO_SHOW" ? " ❌" : (
                        <ActionButton action={statusAction} fields={{ enrollmentId: e.id, status: "COMPLETED" }} variant="ghost" size="sm" className="h-5 px-1 text-[10px]">✓</ActionButton>
                      )}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 border-t-2 border-dashed border-soft-line pt-3">
                  <FormModal trigger="+ Enrol" triggerSize="sm" triggerVariant="secondary" title={`Enrol in ${p.title}`} action={enrollOtherAction}>
                    <input type="hidden" name="programId" value={p.id} />
                    <Field label="Employee"><Select name="employeeId" options={emps.filter((e) => !p.enrollments.some((x) => x.employeeId === e.id)).map((e) => ({ value: e.id, label: e.fullName }))} /></Field>
                  </FormModal>
                  {p.hrdClaimable && p.hrdClaimStatus !== "CLAIMED" && (
                    <ActionButton action={statusAction} fields={{ programId: p.id, hrdClaimStatus: p.hrdClaimStatus === "NOT_APPLIED" ? "APPLIED" : p.hrdClaimStatus === "APPLIED" ? "APPROVED" : "CLAIMED" }}>
                      HRD: mark {p.hrdClaimStatus === "NOT_APPLIED" ? "applied" : p.hrdClaimStatus === "APPLIED" ? "approved" : "claimed"}
                    </ActionButton>
                  )}
                  {p.status === "SCHEDULED" && <ActionButton action={statusAction} fields={{ programId: p.id, programStatus: "COMPLETED" }}>Mark completed</ActionButton>}
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </>
  );
}
