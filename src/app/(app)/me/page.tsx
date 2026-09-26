import Link from "next/link";
import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { Badge, Callout, Card, CardBody, CardHeader, Field, Input, PageHeader, PersonCell, Progress, Select, StatusBadge, Textarea } from "@/components/ui";
import { ActionButton, FormModal } from "@/components/forms";
import { ClockWidget } from "@/components/clock-widget";
import { ApplyLeaveButton, ClaimButton, LoanButton, OvertimeButton } from "@/components/request-forms";
import { available } from "@/server/services/leave.service";
import { fmtDate, fmtTime, periodLabel, rm, todayMY } from "@/lib/utils";
import { COMPANY_VALUES } from "@/lib/constants";
import { can } from "@/lib/permissions";
import { gettingStarted } from "@/server/services/guide.service";
import { GettingStarted } from "@/components/getting-started";
import { ackPolicyAction, clockInAction, clockOutAction, goalProgressAction, grievanceAction, kudosAction, myTaskAction, resignAction, selfReviewAction } from "./actions";

export const metadata: Metadata = { title: "Me" };

export default async function MePage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const id = ctx.employeeId!;
  const today = todayMY();
  const year = today.getUTCFullYear();
  // People who can open the dashboard see their checklist there; everyone else lands here. Runs alongside the rest.
  const guidePromise = can(ctx, "employee.view") ? null : gettingStarted(ctx);

  const [emp, att, balances, lastSlip, anns, tasks, policies, reviews, goals, colleagues, kudos, openSep, letters, results] = await Promise.all([
    prisma.employee.findUniqueOrThrow({ where: { id }, include: { manager: true, department: true, branch: true } }),
    prisma.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId: id, date: today } } }),
    prisma.leaveBalance.findMany({ where: { employeeId: id, year }, include: { leaveType: true } }),
    prisma.payslip.findFirst({ where: { employeeId: id, run: { status: { in: ["PAID", "LOCKED"] } } }, orderBy: { period: "desc" } }),
    prisma.announcement.findMany({ where: { tenantId: ctx.tenantId }, orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }], take: 3 }),
    prisma.checklistTask.findMany({ where: { checklist: { employeeId: id }, owner: "EMPLOYEE" }, orderBy: { dueDate: "asc" } }),
    prisma.policy.findMany({ where: { tenantId: ctx.tenantId, requiresAck: true, acknowledgements: { none: { employeeId: id } } } }),
    prisma.performanceReview.findMany({ where: { employeeId: id, status: "SELF_REVIEW" }, include: { cycle: true } }),
    prisma.goal.findMany({ where: { employeeId: id, status: { not: "DONE" } }, take: 5 }),
    prisma.employee.findMany({ where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROBATION", "NOTICE"] }, id: { not: id } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
    prisma.kudos.findMany({ where: { toId: id }, include: { from: true }, orderBy: { createdAt: "desc" }, take: 3 }),
    prisma.separation.findFirst({ where: { employeeId: id, status: { in: ["PENDING", "APPROVED"] } } }),
    prisma.generatedLetter.findMany({ where: { employeeId: id, status: "ISSUED" } }),
    prisma.performanceReview.findMany({ where: { employeeId: id, status: { in: ["CALIBRATION", "COMPLETED"] } }, include: { cycle: true }, orderBy: { updatedAt: "desc" }, take: 2 }),
  ]);

  const guide = await guidePromise;
  const shown = balances.filter((b) => ["AL", "SL", "RL"].includes(b.leaveType.code) || b.taken > 0);

  return (
    <>
      <PageHeader title={`Hi ${emp.preferredName ?? emp.fullName.split(" ")[0]}!`} emoji="😊" subtitle={`${emp.jobTitle} · ${emp.department?.name ?? ""} · ${emp.branch?.name ?? ""}`} />
      {sp.denied && (
        <div className="mb-5">
          <Callout tone="bubblegum" emoji="🔒">
            That page is for HR and managers. Here&apos;s your personal space instead.
          </Callout>
        </div>
      )}

      {guide && <GettingStarted guide={guide} />}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <ClockWidget
            clockedIn={!!att?.clockIn}
            clockedOut={!!att?.clockOut}
            inAt={att?.clockIn ? fmtTime(att.clockIn) : null}
            outAt={att?.clockOut ? fmtTime(att.clockOut) : null}
            clockInAction={clockInAction}
            clockOutAction={clockOutAction}
          />
          <Card>
            <CardHeader title="Quick actions" emoji="⚡" />
            <CardBody className="grid grid-cols-2 gap-2">
              <ApplyLeaveButton tenantId={ctx.tenantId} gender={emp.gender} btn={{ label: "🌴 Leave", className: "w-full" }} />
              <ClaimButton tenantId={ctx.tenantId} btn={{ label: "🧾 Claim", className: "w-full" }} />
              <OvertimeButton tenantId={ctx.tenantId} btn={{ label: "⏱️ Overtime", className: "w-full" }} />
              <LoanButton tenantId={ctx.tenantId} btn={{ label: "🪙 Advance", className: "w-full" }} />
              <FormModal trigger="🙌 Kudos" triggerVariant="secondary" triggerClassName="w-full" title="Give kudos" action={kudosAction} submitLabel="Send kudos">
                <Field label="To">
                  <Select name="toId" options={colleagues.map((c) => ({ value: c.id, label: c.fullName }))} />
                </Field>
                <Field label="Company value">
                  <Select name="value" options={COMPANY_VALUES.map((v) => ({ value: v, label: v }))} />
                </Field>
                <Field label="Emoji">
                  <Select name="emoji" options={["🙌", "🔥", "🏆", "💛", "🚀", "🎉", "🦾"].map((v) => ({ value: v, label: v }))} />
                </Field>
                <Field label="Message">
                  <Textarea name="message" required placeholder="Thanks for…" />
                </Field>
              </FormModal>
              <FormModal trigger="🛡️ Speak up" triggerVariant="secondary" triggerClassName="w-full" title="Raise a concern" subtitle="Handled confidentially by HR." action={grievanceAction} submitLabel="Submit">
                <Field label="Category">
                  <Select name="category" options={["WORKPLACE", "MANAGER", "PAY", "DISCRIMINATION", "SEXUAL_HARASSMENT", "SAFETY", "OTHER"]} />
                </Field>
                <Field label="Subject">
                  <Input name="subject" required />
                </Field>
                <Field label="What happened?">
                  <Textarea name="description" required rows={5} />
                </Field>
                <Field label="Person(s) involved (optional)">
                  <Input name="against" />
                </Field>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" name="anonymous" /> Submit anonymously (not allowed for sexual harassment complaints)
                </label>
              </FormModal>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {shown.map((b) => (
              <div key={b.id} className="rounded-2xl border-2 border-ink bg-card p-4 shadow-brutal-sm">
                <p className="text-xs font-bold">
                  {b.leaveType.emoji} {b.leaveType.name}
                </p>
                <p className="font-display mt-1 text-3xl font-extrabold">{available(b)}</p>
                <p className="text-[11px] text-muted">
                  of {b.entitled + b.carriedForward + b.adjustment} · {b.pending} pending
                </p>
              </div>
            ))}
            {lastSlip && (
              <Link href={`/me/payslips/${lastSlip.id}`} className="press rounded-2xl border-2 border-ink bg-lime p-4 shadow-brutal-sm">
                <p className="text-xs font-bold">💸 {periodLabel(lastSlip.period)}</p>
                <p className="font-display mt-1 text-2xl font-extrabold">{rm(lastSlip.netPay, { decimals: 0 })}</p>
                <p className="text-[11px]">View payslip →</p>
              </Link>
            )}
          </div>

          {(reviews.length > 0 || policies.length > 0 || letters.length > 0 || tasks.some((t) => !t.done)) && (
            <Card tone="bg-sunny">
              <CardHeader title="Your to-dos" emoji="📝" />
              <CardBody className="space-y-3">
                {reviews.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-ink bg-card px-3 py-2">
                    <span className="text-sm font-semibold">🎯 Self-review for {r.cycle.name}</span>
                    <FormModal trigger="Start" triggerSize="sm" title={`Self-review · ${r.cycle.name}`} action={selfReviewAction} submitLabel="Submit">
                      <input type="hidden" name="reviewId" value={r.id} />
                      <Field label="Overall rating (1–5)">
                        <Select name="rating" defaultValue="3" options={["1", "2", "3", "4", "5"].map((v) => ({ value: v, label: `${v} · ${["Needs improvement", "Partially meets", "Meets expectations", "Exceeds", "Outstanding"][+v - 1]}` }))} />
                      </Field>
                      <Field label="Highlights & reflections">
                        <Textarea name="comment" rows={5} required />
                      </Field>
                    </FormModal>
                  </div>
                ))}
                {letters.map((l) => (
                  <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-ink bg-card px-3 py-2">
                    <span className="text-sm font-semibold">✉️ New letter from HR: {l.title.split(" — ")[0]}</span>
                    <Link href={`/documents/letters/${l.id}`} className="rounded-lg border-2 border-ink bg-ink px-2 py-1 text-xs font-bold text-paper">Read & acknowledge</Link>
                  </div>
                ))}
                {policies.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-ink bg-card px-3 py-2">
                    <span className="text-sm font-semibold">📜 Read & acknowledge: {p.title}</span>
                    <ActionButton action={ackPolicyAction} fields={{ policyId: p.id }} variant="primary">
                      I acknowledge
                    </ActionButton>
                  </div>
                ))}
                {tasks
                  .filter((t) => !t.done)
                  .map((t) => (
                    <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-ink bg-card px-3 py-2">
                      <span className="text-sm font-semibold">✅ {t.title}</span>
                      <ActionButton action={myTaskAction} fields={{ taskId: t.id, done: "true" }}>
                        Mark done
                      </ActionButton>
                    </div>
                  ))}
              </CardBody>
            </Card>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader title="My goals" emoji="🎯" />
              <CardBody className="space-y-4">
                {goals.length === 0 && <p className="text-sm text-muted">No open goals.</p>}
                {goals.map((g) => (
                  <div key={g.id}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{g.title}</p>
                      <FormModal trigger="Update" triggerSize="sm" triggerVariant="secondary" title="Update progress" action={goalProgressAction}>
                        <input type="hidden" name="goalId" value={g.id} />
                        <Field label="Progress (%)">
                          <Input type="number" name="progress" min={0} max={100} defaultValue={g.progress} />
                        </Field>
                        <Field label="Status">
                          <Select name="status" defaultValue={g.status} options={["ON_TRACK", "AT_RISK", "OFF_TRACK", "DONE"]} />
                        </Field>
                      </FormModal>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <Progress value={g.progress} tone={g.status === "AT_RISK" ? "bg-sunny" : g.status === "OFF_TRACK" ? "bg-cherry" : "bg-lime"} />
                      <span className="w-10 text-right font-mono text-xs">{g.progress}%</span>
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Announcements" emoji="📣" />
              {results.length > 0 && (
                <div className="border-b-2 border-dashed border-soft-line px-5 py-3">
                  {results.map((r) => (
                    <p key={r.id} className="text-sm">
                      🎯 <b>{r.cycle.name}</b>: {r.status === "COMPLETED" ? <>final rating <b>{r.finalRating}</b>/5</> : "your manager has reviewed you, and calibration is in progress"}
                      {r.managerComment && <span className="block text-xs text-muted">&ldquo;{r.managerComment}&rdquo;</span>}
                    </p>
                  ))}
                </div>
              )}
              <CardBody className="space-y-3">
                {anns.map((a) => (
                  <div key={a.id}>
                    <p className="text-sm font-bold">
                      {a.emoji} {a.title} {a.pinned && <Badge tone="yellow">Pinned</Badge>}
                    </p>
                    <p className="text-xs text-ink-2">{a.body}</p>
                  </div>
                ))}
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader title="Kudos for you" emoji="💛" />
              <CardBody className="space-y-3">
                {kudos.length === 0 && <p className="text-sm text-muted">None yet. Why not send some?</p>}
                {kudos.map((k) => (
                  <div key={k.id} className="rounded-xl border-2 border-ink bg-paper p-3">
                    <p className="text-sm">
                      {k.emoji} &ldquo;{k.message}&rdquo;
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      from {k.from.fullName} · {k.value}
                    </p>
                  </div>
                ))}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="My manager & employment" emoji="🧭" />
              <CardBody className="space-y-3 text-sm">
                {emp.manager && <PersonCell name={emp.manager.fullName} sub={emp.manager.jobTitle} color={emp.manager.avatarColor} />}
                <p>
                  Joined <b>{fmtDate(emp.joinDate, "long")}</b> · <StatusBadge status={emp.status} />
                </p>
                {openSep ? (
                  <Callout emoji="👋">
                    Resignation {openSep.status.toLowerCase()} · last day {fmtDate(openSep.lastWorkingDate, "long")}
                  </Callout>
                ) : (
                  <FormModal trigger="Submit resignation" triggerVariant="ghost" triggerSize="sm" title="Submit resignation" subtitle="Your notice period follows your contract or Employment Act s.12." action={resignAction} submitLabel="Submit">
                    <Field label="Notice date">
                      <Input type="date" name="noticeDate" defaultValue={today.toISOString().slice(0, 10)} />
                    </Field>
                    <Field label="Proposed last working day">
                      <Input type="date" name="lastWorkingDate" required />
                    </Field>
                    <Field label="Reason (optional)">
                      <Textarea name="reason" />
                    </Field>
                  </FormModal>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
