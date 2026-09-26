import { prisma } from "@/lib/db";
import { MAX_SUSPENSION_DAYS } from "@/lib/statutory/employment-act";
import { addDays, daysBetween, todayMY } from "@/lib/utils";
import { assertCan, audit, notifyEmployee } from "../guard";
import { DomainError, type Ctx } from "../types";

// ───────────── Disciplinary ─────────────

export const DISCIPLINARY_STAGES = ["REPORTED", "INVESTIGATION", "SHOW_CAUSE", "DOMESTIC_INQUIRY", "DECIDED", "CLOSED"] as const;

/**
 * Stages follow natural-justice practice in Malaysian industrial relations:
 * an employee must be given a show-cause letter (right to be heard) before any punitive outcome,
 * and a domestic inquiry is required before dismissal for misconduct.
 */
export async function openCase(ctx: Ctx, input: { employeeId: string; category: string; severity: string; incidentDate: Date; description: string }) {
  assertCan(ctx, "er.manage");
  if (input.incidentDate > todayMY()) throw new DomainError("Incident date can't be in the future.");
  if (!input.description?.trim()) throw new DomainError("Describe the incident.");
  const count = await prisma.disciplinaryCase.count({ where: { tenantId: ctx.tenantId } });
  const c = await prisma.disciplinaryCase.create({
    data: { tenantId: ctx.tenantId, caseNo: `DC-${new Date().getUTCFullYear()}-${String(count + 1).padStart(3, "0")}`, ...input },
  });
  await audit(ctx, "CREATE", "DisciplinaryCase", c.id, `Opened ${c.caseNo}`);
  return c;
}

export async function issueShowCause(ctx: Ctx, id: string, replyDays = 3) {
  assertCan(ctx, "er.manage");
  const c = await prisma.disciplinaryCase.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!c) throw new DomainError("Case not found.");
  if (!["REPORTED", "INVESTIGATION"].includes(c.stage)) throw new DomainError("Show-cause can only be issued before an inquiry.");
  if (replyDays < 2) throw new DomainError("Give the employee at least 48 hours to reply.");
  const now = todayMY();
  const updated = await prisma.disciplinaryCase.update({ where: { id }, data: { stage: "SHOW_CAUSE", showCauseIssuedAt: now, replyDueDate: addDays(now, replyDays) } });
  await notifyEmployee(c.employeeId, "You have received a show-cause letter", `Please reply by ${addDays(now, replyDays).toISOString().slice(0, 10)}`);
  return updated;
}

/** Suspension pending inquiry — EA s.14(2): max 2 weeks, with at least half pay. */
export async function suspendPendingInquiry(ctx: Ctx, id: string, days: number) {
  assertCan(ctx, "er.manage");
  if (days < 1 || days > MAX_SUSPENSION_DAYS) throw new DomainError(`Suspension pending inquiry is limited to ${MAX_SUSPENSION_DAYS} days (EA s.14(2)).`);
  const c = await prisma.disciplinaryCase.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!c) throw new DomainError("Case not found.");
  if (["DECIDED", "CLOSED"].includes(c.stage)) throw new DomainError("Case is already decided.");
  return prisma.disciplinaryCase.update({ where: { id }, data: { suspended: true, suspensionDays: days } });
}

export async function scheduleInquiry(ctx: Ctx, id: string, date: Date, panel: string) {
  assertCan(ctx, "er.manage");
  const c = await prisma.disciplinaryCase.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!c) throw new DomainError("Case not found.");
  if (c.stage !== "SHOW_CAUSE") throw new DomainError("Issue a show-cause letter before scheduling a domestic inquiry.");
  if (!panel.trim()) throw new DomainError("Name the inquiry panel.");
  if (c.showCauseIssuedAt && daysBetween(c.showCauseIssuedAt, date) < 2) throw new DomainError("Allow the employee reasonable time (≥ 2 days) to prepare.");
  return prisma.disciplinaryCase.update({ where: { id }, data: { stage: "DOMESTIC_INQUIRY", inquiryDate: date, inquiryPanel: panel } });
}

export async function recordReply(ctx: Ctx, id: string, reply: string) {
  assertCan(ctx, "er.manage");
  const c = await prisma.disciplinaryCase.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!c || c.stage !== "SHOW_CAUSE") throw new DomainError("No show-cause letter awaiting reply.");
  return prisma.disciplinaryCase.update({ where: { id }, data: { replyReceived: reply } });
}

const PUNITIVE = ["WRITTEN_WARNING", "FINAL_WARNING", "SUSPENSION", "DEMOTION", "DISMISSAL"];

export async function decideCase(ctx: Ctx, id: string, outcome: string, notes: string) {
  assertCan(ctx, "er.manage");
  const c = await prisma.disciplinaryCase.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!c) throw new DomainError("Case not found.");
  if (["DECIDED", "CLOSED"].includes(c.stage)) throw new DomainError("Case is already decided.");
  if (PUNITIVE.includes(outcome) && !["SHOW_CAUSE", "DOMESTIC_INQUIRY"].includes(c.stage)) {
    throw new DomainError("The employee must be given a chance to explain (show-cause) before any punitive outcome.");
  }
  if (["DISMISSAL", "DEMOTION"].includes(outcome) && c.stage !== "DOMESTIC_INQUIRY") {
    throw new DomainError("A domestic inquiry is required before dismissal or demotion (EA s.14(1)).");
  }
  if (!notes.trim()) throw new DomainError("Record the reasons for the decision.");
  const updated = await prisma.disciplinaryCase.update({ where: { id }, data: { stage: "DECIDED", outcome, outcomeNotes: notes } });
  await audit(ctx, "UPDATE", "DisciplinaryCase", id, `Decided ${c.caseNo}: ${outcome}`);
  return updated;
}

export async function closeCase(ctx: Ctx, id: string) {
  assertCan(ctx, "er.manage");
  const c = await prisma.disciplinaryCase.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!c || c.stage !== "DECIDED") throw new DomainError("Only decided cases can be closed.");
  return prisma.disciplinaryCase.update({ where: { id }, data: { stage: "CLOSED" } });
}

// ───────────── Grievances & sexual harassment ─────────────

/**
 * Sexual harassment complaints (EA Part XVA, s.81A–81H): the employer must inquire into the complaint;
 * if it decides not to, it must inform the complainant with reasons within 30 days.
 */
export async function fileGrievance(ctx: Ctx, input: { employeeId?: string | null; anonymous: boolean; category: string; subject: string; description: string; against?: string }) {
  if (input.employeeId && input.employeeId !== ctx.employeeId) assertCan(ctx, "er.manage");
  if (!input.subject?.trim() || !input.description?.trim()) throw new DomainError("Subject and description are required.");
  if (input.category === "SEXUAL_HARASSMENT" && input.anonymous) {
    throw new DomainError("Sexual harassment complaints can't be anonymous — the law requires an inquiry with the complainant. Your identity stays confidential.");
  }
  const count = await prisma.grievance.count({ where: { tenantId: ctx.tenantId } });
  const now = todayMY();
  const g = await prisma.grievance.create({
    data: {
      tenantId: ctx.tenantId,
      refNo: `GR-${now.getUTCFullYear()}-${String(count + 1).padStart(3, "0")}`,
      employeeId: input.anonymous ? null : input.employeeId ?? ctx.employeeId,
      anonymous: input.anonymous,
      category: input.category,
      subject: input.subject,
      description: input.description,
      against: input.against,
      priority: input.category === "SEXUAL_HARASSMENT" ? "HIGH" : "MEDIUM",
      inquiryDueDate: input.category === "SEXUAL_HARASSMENT" ? addDays(now, 30) : null,
    },
  });
  return g;
}

export async function updateGrievance(ctx: Ctx, id: string, status: string, resolution?: string) {
  assertCan(ctx, "er.manage");
  const g = await prisma.grievance.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!g) throw new DomainError("Grievance not found.");
  if (["RESOLVED", "CLOSED"].includes(status) && !resolution?.trim()) throw new DomainError("Record the resolution before closing.");
  if (g.category === "SEXUAL_HARASSMENT" && status === "CLOSED" && g.status === "OPEN") {
    throw new DomainError("Sexual harassment complaints must be investigated (or formally declined with reasons) before closing.");
  }
  return prisma.grievance.update({
    where: { id },
    data: { status, resolution: resolution ?? g.resolution, resolvedAt: ["RESOLVED", "CLOSED"].includes(status) ? new Date() : null },
  });
}

// ───────────── Foreign workforce ─────────────

export type PermitAlert = "EXPIRED" | "CRITICAL" | "WARNING" | "OK";

/** Immigration recommends renewal ≥ 3 months before expiry; passports need ≥ 18 months validity for PLKS renewal. */
export function permitAlert(expiry: Date, today: Date = todayMY()): PermitAlert {
  const days = daysBetween(today, expiry);
  if (days < 0) return "EXPIRED";
  if (days <= 30) return "CRITICAL";
  if (days <= 90) return "WARNING";
  return "OK";
}

export function passportOkForRenewal(passportExpiry: Date | null, today: Date = todayMY()) {
  if (!passportExpiry) return false;
  return daysBetween(today, passportExpiry) >= 548; // ~18 months
}

export async function upsertPermit(
  ctx: Ctx,
  input: { id?: string; employeeId: string; permitType: string; permitNo: string; sector: string; sourceCountry: string; issueDate: Date; expiryDate: Date; levyAmount: number; levyPaidUntil?: Date | null; fomemaDate?: Date | null; fomemaStatus: string; insuranceNo?: string | null; insuranceExpiry?: Date | null },
) {
  assertCan(ctx, "foreign.manage");
  const emp = await prisma.employee.findFirst({ where: { id: input.employeeId, tenantId: ctx.tenantId } });
  if (!emp) throw new DomainError("Employee not found.");
  if (emp.citizenship !== "FOREIGNER") throw new DomainError("Work permits are for non-citizen employees only.");
  if (input.expiryDate <= input.issueDate) throw new DomainError("Expiry must be after issue date.");
  if (input.permitType === "PLKS" && input.fomemaStatus === "UNFIT") throw new DomainError("Workers certified UNFIT by FOMEMA can't hold a PLKS — arrange repatriation.");
  const status = permitAlert(input.expiryDate) === "EXPIRED" ? "EXPIRED" : permitAlert(input.expiryDate) === "OK" ? "ACTIVE" : "RENEWAL";
  const { id, ...data } = input;
  if (id) return prisma.workPermit.update({ where: { id }, data: { ...data, status } });
  return prisma.workPermit.create({ data: { tenantId: ctx.tenantId, ...data, status } });
}

// ───────────── Assets ─────────────

export async function assignAsset(ctx: Ctx, assetId: string, employeeId: string) {
  assertCan(ctx, "assets.manage");
  const a = await prisma.asset.findFirst({ where: { id: assetId, tenantId: ctx.tenantId } });
  if (!a) throw new DomainError("Asset not found.");
  if (a.status !== "AVAILABLE") throw new DomainError(`Asset is ${a.status.toLowerCase()} — return it first.`);
  const emp = await prisma.employee.findFirst({ where: { id: employeeId, tenantId: ctx.tenantId } });
  if (!emp || ["RESIGNED", "TERMINATED", "RETIRED"].includes(emp.status)) throw new DomainError("Can't assign to a former employee.");
  return prisma.asset.update({ where: { id: assetId }, data: { status: "ASSIGNED", assignedToId: employeeId, assignedAt: new Date() } });
}

export async function returnAsset(ctx: Ctx, assetId: string, condition: string, notes?: string) {
  assertCan(ctx, "assets.manage");
  const a = await prisma.asset.findFirst({ where: { id: assetId, tenantId: ctx.tenantId } });
  if (!a || a.status !== "ASSIGNED") throw new DomainError("Asset isn't currently assigned.");
  return prisma.asset.update({
    where: { id: assetId },
    data: { status: condition === "POOR" ? "REPAIR" : "AVAILABLE", condition, assignedToId: null, assignedAt: null, notes: notes ?? a.notes },
  });
}

/** Straight-line depreciation (default 3 years for IT). */
export function bookValue(cost: number, purchaseDate: Date | null, lifeYears = 3, today: Date = todayMY()) {
  if (!purchaseDate) return cost;
  const years = daysBetween(purchaseDate, today) / 365.25;
  return Math.max(0, Math.round(cost * (1 - years / lifeYears) * 100) / 100);
}

/** Generates a show-cause letter draft from the SHOW_CAUSE template, pre-filled with the case details. */
export async function showCauseLetter(ctx: Ctx, caseId: string) {
  assertCan(ctx, "er.manage");
  const c = await prisma.disciplinaryCase.findFirst({ where: { id: caseId, tenantId: ctx.tenantId } });
  if (!c) throw new DomainError("Case not found.");
  const tpl = await prisma.letterTemplate.findFirst({ where: { tenantId: ctx.tenantId, category: "SHOW_CAUSE" } });
  if (!tpl) throw new DomainError("No show-cause letter template. Add one in Letters & policies.");
  const { generateLetter, updateLetter } = await import("./culture.service");
  const letter = await generateLetter(ctx, tpl.id, c.employeeId);
  const detail = `${c.description} (Case ${c.caseNo}, incident on ${c.incidentDate.toISOString().slice(0, 10)})`;
  const content = letter.content.replace(/\[Describe the alleged misconduct[^\]]*\]/, detail);
  await updateLetter(ctx, letter.id, content);
  return letter;
}
