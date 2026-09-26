import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { Avatar, Badge, Card, CardBody, CardHeader, Checkbox, Field, Input, PageHeader, Progress, Select, StatCard, Tabs, Textarea } from "@/components/ui";
import { ActionButton, ActionForm, FormModal, SubmitButton } from "@/components/forms";
import { DistributionChart } from "@/components/charts";
import { act } from "@/server/action";
import { enps, respondentKey, type SurveyQuestion } from "@/server/services/culture.service";
import { boolField, dateField, fmtDate, str } from "@/lib/utils";
import { COMPANY_VALUES } from "@/lib/constants";
import { DomainError, type ActionState } from "@/server/types";
import { kudosAction, surveyAction } from "../me/actions";

export const metadata: Metadata = { title: "Engagement" };

async function announceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("engagement.manage");
  return act(async () => {
    if (!str(fd, "title") || !str(fd, "body")) throw new DomainError("Title and message are required.");
    await prisma.announcement.create({ data: { tenantId: ctx.tenantId, title: str(fd, "title"), body: str(fd, "body"), emoji: str(fd, "emoji") || "📣", pinned: boolField(fd, "pinned"), authorName: ctx.userName } });
    revalidatePath("/engagement");
    return "Announcement posted 📣";
  });
}

async function surveyCreateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("engagement.manage");
  return act(async () => {
    const lines = str(fd, "questions").split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) throw new DomainError("Add at least one question.");
    const questions: SurveyQuestion[] = lines.map((l, i) => {
      const [type, ...rest] = l.split(":");
      const t = type.trim().toUpperCase();
      return ["NPS", "SCALE", "TEXT"].includes(t) ? { id: `q${i + 1}`, type: t as "NPS", text: rest.join(":").trim() } : { id: `q${i + 1}`, type: "SCALE", text: l };
    });
    await prisma.survey.create({ data: { tenantId: ctx.tenantId, title: str(fd, "title"), description: str(fd, "description"), questions: JSON.stringify(questions), anonymous: boolField(fd, "anonymous"), closesAt: dateField(fd, "closesAt") } });
    revalidatePath("/engagement");
    return "Survey launched";
  });
}

async function surveyStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("engagement.manage");
  return act(async () => {
    if (!["OPEN", "CLOSED"].includes(str(fd, "status"))) throw new DomainError("Unknown survey status.");
    await prisma.survey.update({ where: { id: str(fd, "id"), tenantId: ctx.tenantId }, data: { status: str(fd, "status") } });
    revalidatePath("/engagement");
    return str(fd, "status") === "CLOSED" ? "Survey closed" : "Survey reopened";
  });
}

async function announcementAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("engagement.manage");
  return act(async () => {
    const id = str(fd, "id");
    if (str(fd, "op") === "delete") await prisma.announcement.delete({ where: { id, tenantId: ctx.tenantId } });
    else {
      const a = await prisma.announcement.findFirstOrThrow({ where: { id, tenantId: ctx.tenantId } });
      await prisma.announcement.update({ where: { id }, data: { pinned: !a.pinned } });
    }
    revalidatePath("/engagement");
    return "Updated";
  });
}

export default async function EngagementPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requireCtx();
  const tab = (await searchParams).tab ?? "feed";
  const manage = can(ctx, "engagement.manage");
  const [anns, kudos, surveys, emps] = await Promise.all([
    prisma.announcement.findMany({ where: { tenantId: ctx.tenantId }, orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }] }),
    prisma.kudos.findMany({ where: { tenantId: ctx.tenantId }, include: { from: true, to: true }, orderBy: { createdAt: "desc" }, take: 40 }),
    prisma.survey.findMany({ where: { tenantId: ctx.tenantId }, include: { responses: true }, orderBy: { createdAt: "desc" } }),
    prisma.employee.findMany({ where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROBATION", "NOTICE"] }, id: { not: ctx.employeeId ?? "" } }, orderBy: { fullName: "asc" } }),
  ]);
  const leaderboard = Object.values(kudos.reduce<Record<string, { name: string; color: string; n: number }>>((a, k) => ({ ...a, [k.toId]: { name: k.to.fullName, color: k.to.avatarColor, n: (a[k.toId]?.n ?? 0) + 1 } }), {})).sort((a, b) => b.n - a.n).slice(0, 5);
  const byValue = COMPANY_VALUES.map((v) => ({ name: v.split(" ")[0], value: kudos.filter((k) => k.value === v).length }));

  return (
    <>
      <PageHeader
        title="Engagement"
        emoji="🎉"
        subtitle="Announcements, peer kudos and pulse surveys."
        actions={
          <>
            {ctx.employeeId && (
              <FormModal trigger="🙌 Give kudos" triggerVariant="lime" title="Give kudos" action={kudosAction}>
                <Field label="To"><Select name="toId" options={emps.map((e) => ({ value: e.id, label: e.fullName }))} /></Field>
                <Field label="Value"><Select name="value" options={COMPANY_VALUES.map((v) => ({ value: v, label: v }))} /></Field>
                <Field label="Emoji"><Select name="emoji" options={["🙌", "🔥", "🏆", "💛", "🚀", "🎉"].map((v) => ({ value: v, label: v }))} /></Field>
                <Field label="Message"><Textarea name="message" required /></Field>
              </FormModal>
            )}
            {manage && (
              <FormModal trigger="📣 Announce" title="New announcement" action={announceAction}>
                <div className="grid grid-cols-4 gap-3">
                  <Field label="Emoji"><Input name="emoji" defaultValue="📣" /></Field>
                  <Field label="Title" className="col-span-3"><Input name="title" required /></Field>
                </div>
                <Field label="Message"><Textarea name="body" rows={5} required /></Field>
                <Checkbox name="pinned" label="Pin to top" />
              </FormModal>
            )}
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Kudos (recent)" value={kudos.length} tone="lime" emoji="🙌" />
        <StatCard label="Announcements" value={anns.length} tone="sky" emoji="📣" />
        <StatCard label="Open surveys" value={surveys.filter((s) => s.status === "OPEN").length} tone="bubblegum" emoji="📋" />
        <StatCard label="Latest eNPS" value={(() => { const s = surveys[0]; if (!s) return "-"; const q = (JSON.parse(s.questions) as SurveyQuestion[]).find((x) => x.type === "NPS"); if (!q) return "-"; const v = enps(s.responses.map((r) => Number(JSON.parse(r.answers)[q.id])).filter((n) => !Number.isNaN(n))); return v === null ? "-" : v > 0 ? `+${v}` : `${v}`; })()} tone="sunny" emoji="💓" />
      </div>
      <Tabs active={tab} tabs={[{ key: "feed", label: "Announcements", href: "/engagement?tab=feed" }, { key: "kudos", label: "Kudos wall", href: "/engagement?tab=kudos" }, { key: "surveys", label: "Surveys", href: "/engagement?tab=surveys" }]} />

      {tab === "feed" && (
        <div className="grid gap-4 md:grid-cols-2">
          {anns.map((a) => (
            <Card key={a.id} tone={a.pinned ? "bg-sunny" : undefined}>
              <CardBody>
                <p className="text-3xl">{a.emoji}</p>
                <p className="font-display mt-2 text-xl font-extrabold">{a.title} {a.pinned && <Badge tone="ink">Pinned</Badge>}</p>
                <p className="mt-1 text-sm text-ink-2">{a.body}</p>
                <p className="mt-3 text-xs text-muted">{a.authorName} · {fmtDate(a.publishedAt, "long")}</p>
                {manage && (
                  <div className="mt-3 flex gap-2">
                    <ActionButton action={announcementAction} fields={{ id: a.id, op: "pin" }}>{a.pinned ? "Unpin" : "Pin"}</ActionButton>
                    <ActionButton action={announcementAction} fields={{ id: a.id, op: "delete" }} variant="ghost" confirm="Delete this announcement?">Delete</ActionButton>
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {tab === "kudos" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
            {kudos.map((k, i) => (
              <div key={k.id} className="rounded-2xl border-2 border-ink bg-card p-4 shadow-brutal-sm" style={{ transform: `rotate(${[-1, 0.8, -0.5, 1.2][i % 4]}deg)` }}>
                <p className="text-3xl">{k.emoji}</p>
                <p className="mt-2 text-sm">&ldquo;{k.message}&rdquo;</p>
                <div className="mt-3 flex items-center gap-2 text-xs">
                  <Avatar name={k.from.fullName} color={k.from.avatarColor} size={22} />
                  <span className="font-semibold">{k.from.preferredName ?? k.from.fullName}</span> → <span className="font-bold">{k.to.preferredName ?? k.to.fullName}</span>
                </div>
                <Badge tone="purple" className="mt-2">{k.value}</Badge>
              </div>
            ))}
          </div>
          <div className="space-y-6">
            <Card>
              <CardHeader title="Most appreciated" emoji="🏆" />
              <CardBody className="space-y-3">
                {leaderboard.map((l, i) => (
                  <div key={l.name} className="flex items-center gap-2">
                    <span className="w-5 font-display font-extrabold">{i + 1}</span>
                    <Avatar name={l.name} color={l.color} size={28} />
                    <span className="flex-1 text-sm font-semibold">{l.name}</span>
                    <Badge tone="lime">{l.n} 🙌</Badge>
                  </div>
                ))}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Kudos by value" emoji="🧭" />
              <div className="p-4"><DistributionChart data={byValue} height={200} /></div>
            </Card>
          </div>
        </div>
      )}

      {tab === "surveys" && (
        <div className="space-y-6">
          {manage && (
            <div className="flex justify-end">
              <FormModal trigger="+ Survey" title="Launch pulse survey" action={surveyCreateAction} wide>
                <Field label="Title"><Input name="title" required /></Field>
                <Field label="Description"><Input name="description" /></Field>
                <Field label="Questions (one per line)" hint='Prefix with NPS:, SCALE: (1–5) or TEXT:, e.g. "NPS: How likely are you to recommend us?"'>
                  <Textarea name="questions" rows={6} defaultValue={"NPS: How likely are you to recommend us as a workplace?\nSCALE: I feel recognised for my work.\nTEXT: What should we improve?"} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Closes"><Input type="date" name="closesAt" /></Field>
                  <div className="flex items-end pb-2"><Checkbox name="anonymous" label="Anonymous" defaultChecked /></div>
                </div>
              </FormModal>
            </div>
          )}
          {surveys.map((s) => {
            const qs = JSON.parse(s.questions) as SurveyQuestion[];
            const answers = s.responses.map((r) => JSON.parse(r.answers) as Record<string, string | number>);
            const responded = ctx.employeeId ? s.responses.some((r) => r.respondentKey === respondentKey(s.id, ctx.employeeId!)) : true;
            return (
              <Card key={s.id}>
                <CardHeader
                  title={s.title}
                  emoji="📋"
                  subtitle={`${s.description ?? ""} · ${s.responses.length} responses${s.anonymous ? " · anonymous" : ""}${s.closesAt ? ` · closes ${fmtDate(s.closesAt)}` : ""}`}
                  action={
                    manage && (
                      <ActionButton action={surveyStatusAction} fields={{ id: s.id, status: s.status === "OPEN" ? "CLOSED" : "OPEN" }} confirm={s.status === "OPEN" ? "Close this survey to new responses?" : undefined}>
                        {s.status === "OPEN" ? "Close survey" : "Reopen"}
                      </ActionButton>
                    )
                  }
                />
                <CardBody>
                  <div className="grid gap-6 lg:grid-cols-2">
                    {!responded && s.status === "OPEN" && (
                      <ActionForm action={surveyAction} className="space-y-4 rounded-2xl border-2 border-dashed border-ink p-4">
                        <input type="hidden" name="surveyId" value={s.id} />
                        {qs.map((q) => (
                          <Field key={q.id} label={q.text}>
                            <input type="hidden" name={`t_${q.id}`} value={q.type} />
                            {q.type === "TEXT" ? <Textarea name={`q_${q.id}`} /> : (
                              <Select name={`q_${q.id}`} defaultValue={q.type === "NPS" ? "8" : "4"} options={(q.type === "NPS" ? [...Array(11).keys()] : [1, 2, 3, 4, 5]).map((n) => ({ value: String(n), label: String(n) }))} />
                            )}
                          </Field>
                        ))}
                        <SubmitButton>Submit response</SubmitButton>
                      </ActionForm>
                    )}
                    {(manage || responded) && (
                      <div className="space-y-4">
                        {qs.map((q) => {
                          const vals = answers.map((a) => a[q.id]).filter((v) => v !== undefined && v !== "");
                          if (q.type === "TEXT") return (
                            <div key={q.id}>
                              <p className="text-sm font-bold">{q.text}</p>
                              <ul className="mt-1 space-y-1">{vals.slice(0, 6).map((v, i) => <li key={i} className="rounded-lg bg-paper-2 px-2 py-1 text-xs">💬 {String(v)}</li>)}</ul>
                            </div>
                          );
                          const nums = vals.map(Number);
                          const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
                          return (
                            <div key={q.id}>
                              <p className="text-sm font-bold">{q.text}</p>
                              {q.type === "NPS" ? (
                                <p className="text-sm">eNPS <b className="font-display text-2xl">{enps(nums) ?? "-"}</b> <span className="text-xs text-muted">({nums.filter((n) => n >= 9).length} promoters · {nums.filter((n) => n <= 6).length} detractors)</span></p>
                              ) : (
                                <div className="flex items-center gap-2"><Progress value={(avg / 5) * 100} tone="bg-grape" /><span className="font-mono text-xs">{avg.toFixed(2)}/5</span></div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
