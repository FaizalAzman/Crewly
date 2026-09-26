import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { fmtDate, rm } from "@/lib/utils";
import { assertCan, audit, claimTransition, notifyEmployee } from "../guard";
import { can } from "@/lib/permissions";
import { DomainError, ForbiddenError, type Ctx } from "../types";
import { nextSequence } from "./sequence.service";

// ───────────── Letters (merge fields) ─────────────

export interface MergeContext {
  employee: Record<string, unknown>;
  company: Record<string, unknown>;
  extra?: Record<string, string>;
}

/** Replaces {{path.to.value}} placeholders. Unknown placeholders are left visible as [missing: x]. */
export function mergeTemplate(body: string, ctx: MergeContext) {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    if (ctx.extra && key in ctx.extra) return ctx.extra[key];
    const [root, ...rest] = key.split(".");
    let v: unknown = root === "employee" ? ctx.employee : root === "company" ? ctx.company : undefined;
    for (const k of rest) v = v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined;
    if (v === undefined || v === null || v === "") return `[missing: ${key}]`;
    if (v instanceof Date) return fmtDate(v, "long");
    if (typeof v === "number" && /salary/i.test(key)) return rm(v);
    return String(v);
  });
}

export async function generateLetter(ctx: Ctx, templateId: string, employeeId: string, extra: Record<string, string> = {}) {
  assertCan(ctx, "documents.manage");
  const [tpl, emp] = await Promise.all([
    prisma.letterTemplate.findFirst({ where: { id: templateId, tenantId: ctx.tenantId } }),
    prisma.employee.findFirst({ where: { id: employeeId, tenantId: ctx.tenantId }, include: { company: true, department: true } }),
  ]);
  if (!tpl || !emp) throw new DomainError("Template or employee not found.");
  const content = mergeTemplate(tpl.body, {
    employee: { ...emp, department: emp.department?.name ?? "", preferredName: emp.preferredName ?? emp.fullName },
    company: emp.company,
    extra: {
      today: fmtDate(new Date(), "long"),
      signatory: emp.company.signatoryName || ctx.userName,
      signatoryTitle: emp.company.signatoryTitle ?? "",
      effectiveDate: fmtDate(new Date(), "long"),
      ...extra,
    },
  });
  const letter = await prisma.generatedLetter.create({ data: { tenantId: ctx.tenantId, templateId, employeeId, title: `${tpl.name} — ${emp.fullName}`, content } });
  await audit(ctx, "CREATE", "Letter", letter.id, `Generated "${tpl.name}" for ${emp.fullName}`);
  return letter;
}

async function loadLetter(ctx: Ctx, id: string) {
  const l = await prisma.generatedLetter.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { employee: true } });
  if (!l) throw new DomainError("Letter not found.");
  return l;
}

/** Drafts can be edited (e.g. to fill in the details of a warning) before they're issued. */
export async function updateLetter(ctx: Ctx, id: string, content: string, title?: string) {
  assertCan(ctx, "documents.manage");
  const l = await loadLetter(ctx, id);
  if (l.status !== "DRAFT") throw new DomainError("Issued letters can't be edited. Generate a new one instead.");
  if (!content.trim()) throw new DomainError("The letter can't be empty.");
  if (/\[missing: /.test(content)) throw new DomainError("Fill in the [missing: …] fields before saving.");
  // Only while still a draft: an edit racing an "Issue" must not change the issued text.
  await claimTransition(prisma.generatedLetter.updateMany({ where: { id, status: "DRAFT" }, data: { content, title: title?.trim() || l.title } }), "This letter was issued in the meantime, so it can't be edited.");
  return prisma.generatedLetter.findUniqueOrThrow({ where: { id } });
}

/** Issue: freezes the content, notifies the employee and shows it in their Me → Documents. */
export async function issueLetter(ctx: Ctx, id: string) {
  assertCan(ctx, "documents.manage");
  const l = await loadLetter(ctx, id);
  if (l.status !== "DRAFT") throw new DomainError("This letter has already been issued.");
  const left = unresolvedPlaceholders(l.content);
  if (left.length) throw new DomainError(`Complete the placeholders before issuing: ${left.join(", ")}`);
  await claimTransition(prisma.generatedLetter.updateMany({ where: { id, status: "DRAFT", content: l.content }, data: { status: "ISSUED", issuedAt: new Date(), issuedBy: ctx.userName } }), "This letter changed or was issued in the meantime. Refresh and check it before issuing.");
  const updated = await prisma.generatedLetter.findUniqueOrThrow({ where: { id } });
  await notifyEmployee(l.employeeId, `You have a new letter: ${l.title.split(" — ")[0]}`, "Please read and acknowledge it.", "/me/documents");
  await audit(ctx, "UPDATE", "Letter", id, `Issued "${l.title}"`);
  return updated;
}

export async function acknowledgeLetter(ctx: Ctx, id: string) {
  const l = await loadLetter(ctx, id);
  if (l.employeeId !== ctx.employeeId) throw new ForbiddenError("Only the recipient can acknowledge this letter.");
  if (l.status !== "ISSUED") throw new DomainError(l.status === "ACKNOWLEDGED" ? "Already acknowledged." : "This letter hasn't been issued yet.");
  await claimTransition(prisma.generatedLetter.updateMany({ where: { id, status: "ISSUED" }, data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date() } }), "Already acknowledged.");
  return prisma.generatedLetter.findUniqueOrThrow({ where: { id } });
}

export async function deleteLetter(ctx: Ctx, id: string) {
  assertCan(ctx, "documents.manage");
  const l = await loadLetter(ctx, id);
  if (l.status !== "DRAFT") throw new DomainError("Issued letters are part of the employee record and can't be deleted.");
  await claimTransition(prisma.generatedLetter.deleteMany({ where: { id, status: "DRAFT" } }), "This letter was issued in the meantime, so it's now part of the employee record.");
}

/** Who may read a letter: document managers, or the recipient once it's issued. */
export async function readableLetter(ctx: Ctx, id: string) {
  const l = await prisma.generatedLetter.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { employee: { include: { company: true } } } });
  if (!l) return null;
  if (ctx.permissions.includes("documents.manage")) return l;
  if (l.employeeId === ctx.employeeId && l.status !== "DRAFT") return l;
  return null;
}

export async function acknowledgePolicy(ctx: Ctx, policyId: string) {
  if (!ctx.employeeId) throw new DomainError("Your login isn't linked to an employee profile.");
  const p = await prisma.policy.findFirst({ where: { id: policyId, tenantId: ctx.tenantId } });
  if (!p) throw new DomainError("Policy not found.");
  return prisma.policyAcknowledgement.upsert({
    where: { policyId_employeeId: { policyId, employeeId: ctx.employeeId } },
    update: {},
    create: { policyId, employeeId: ctx.employeeId },
  });
}

// ───────────── Engagement ─────────────

export async function giveKudos(ctx: Ctx, input: { toId: string; value: string; message: string; emoji?: string }) {
  if (!ctx.employeeId) throw new DomainError("Your login isn't linked to an employee profile.");
  if (input.toId === ctx.employeeId) throw new DomainError("Nice try — you can't give kudos to yourself 😄");
  if (input.message.trim().length < 5) throw new DomainError("Say a little more about why!");
  const to = await prisma.employee.findFirst({ where: { id: input.toId, tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROBATION", "NOTICE"] } } });
  if (!to) throw new DomainError("Pick a colleague.");
  const since = new Date(Date.now() - 86400000);
  const today = await prisma.kudos.count({ where: { fromId: ctx.employeeId, createdAt: { gte: since } } });
  if (today >= 5) throw new DomainError("You've given 5 kudos in the last 24 hours — save some for tomorrow!");
  const k = await prisma.kudos.create({ data: { tenantId: ctx.tenantId, fromId: ctx.employeeId, ...input } });
  await notifyEmployee(input.toId, `You got kudos! ${input.emoji ?? "🙌"}`, input.message, "/engagement");
  return k;
}

export interface SurveyQuestion {
  id: string;
  text: string;
  type: "SCALE" | "NPS" | "TEXT";
}

export function respondentKey(surveyId: string, employeeId: string) {
  return createHash("sha256").update(`${surveyId}:${employeeId}`).digest("hex").slice(0, 32);
}

export async function respondSurvey(ctx: Ctx, surveyId: string, answers: Record<string, string | number>) {
  if (!ctx.employeeId) throw new DomainError("Your login isn't linked to an employee profile.");
  const s = await prisma.survey.findFirst({ where: { id: surveyId, tenantId: ctx.tenantId } });
  if (!s) throw new DomainError("Survey not found.");
  if (s.status !== "OPEN" || (s.closesAt && s.closesAt < new Date())) throw new DomainError("This survey is closed.");
  const qs = JSON.parse(s.questions) as SurveyQuestion[];
  for (const q of qs) {
    const a = answers[q.id];
    if (q.type === "NPS" && (typeof a !== "number" || a < 0 || a > 10)) throw new DomainError(`Answer "${q.text}" with 0 – 10.`);
    if (q.type === "SCALE" && (typeof a !== "number" || a < 1 || a > 5)) throw new DomainError(`Answer "${q.text}" with 1 – 5.`);
  }
  const key = respondentKey(surveyId, ctx.employeeId);
  if (await prisma.surveyResponse.findUnique({ where: { surveyId_respondentKey: { surveyId, respondentKey: key } } })) {
    throw new DomainError("You've already responded — thank you!");
  }
  return prisma.surveyResponse.create({
    data: { surveyId, respondentKey: key, employeeId: s.anonymous ? null : ctx.employeeId, answers: JSON.stringify(answers) },
  });
}

/** eNPS = % promoters (9–10) − % detractors (0–6). */
export function enps(scores: number[]) {
  if (!scores.length) return null;
  const promoters = scores.filter((s) => s >= 9).length;
  const detractors = scores.filter((s) => s <= 6).length;
  return Math.round(((promoters - detractors) / scores.length) * 100);
}

// ───────────── Helpdesk ─────────────

export const SLA_HOURS: Record<string, number> = { URGENT: 4, HIGH: 24, MEDIUM: 72, LOW: 120 };

export function slaBreached(createdAt: Date, priority: string, status: string, now = new Date()) {
  if (["RESOLVED", "CLOSED"].includes(status)) return false;
  return now.getTime() - createdAt.getTime() > (SLA_HOURS[priority] ?? 72) * 3600000;
}

export const TICKET_CATEGORIES = ["PAYROLL", "LEAVE", "BENEFITS", "IT", "LETTER_REQUEST", "POLICY", "OTHER"];
export const TICKET_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export async function openTicket(ctx: Ctx, input: { category: string; subject: string; description: string; priority: string }) {
  if (!ctx.employeeId) throw new DomainError("Your login isn't linked to an employee profile.");
  if (!input.subject.trim() || !input.description.trim()) throw new DomainError("Subject and description are required.");
  if (!TICKET_CATEGORIES.includes(input.category)) throw new DomainError("Pick a category.");
  if (!TICKET_PRIORITIES.includes(input.priority)) throw new DomainError("Pick a priority.");
  const n = await nextSequence(ctx.tenantId, "ticket", () => prisma.ticket.count({ where: { tenantId: ctx.tenantId } }));
  return prisma.ticket.create({
    data: { tenantId: ctx.tenantId, refNo: `HR-${String(n + 1000)}`, employeeId: ctx.employeeId, ...input },
  });
}

export async function commentTicket(ctx: Ctx, ticketId: string, body: string, internal: boolean) {
  const t = await prisma.ticket.findFirst({ where: { id: ticketId, tenantId: ctx.tenantId } });
  if (!t) throw new DomainError("Ticket not found.");
  const isAgent = can(ctx, "helpdesk.manage");
  if (!isAgent && t.employeeId !== ctx.employeeId) throw new DomainError("Ticket not found.");
  if (internal && !isAgent) throw new DomainError("Only HR can add internal notes.");
  if (!body.trim()) throw new DomainError("Write a message first.");
  if (t.status === "CLOSED") throw new DomainError("This ticket is closed.");
  await prisma.ticketComment.create({ data: { ticketId, authorName: ctx.userName, body, internal } });
  if (isAgent && !internal) {
    await prisma.ticket.update({ where: { id: ticketId }, data: { status: t.status === "OPEN" ? "IN_PROGRESS" : t.status } });
    await notifyEmployee(t.employeeId, `HR replied to ${t.refNo}`, body.slice(0, 80), `/helpdesk/${t.id}`);
  }
}

export async function setTicketStatus(ctx: Ctx, ticketId: string, status: string, assignee?: string) {
  assertCan(ctx, "helpdesk.manage");
  const t = await prisma.ticket.findFirst({ where: { id: ticketId, tenantId: ctx.tenantId } });
  if (!t) throw new DomainError("Ticket not found.");
  return prisma.ticket.update({ where: { id: ticketId }, data: { status, assignee: assignee ?? t.assignee } });
}

/** Placeholders a human must fill before a letter can be issued, e.g. "[describe matter]" or "[missing: employee.address]". */
export function unresolvedPlaceholders(content: string): string[] {
  return [...new Set(content.match(/\[(?:missing:[^\]]*|describe[^\]]*|insert[^\]]*|enter[^\]]*)\]/gi) ?? [])];
}
