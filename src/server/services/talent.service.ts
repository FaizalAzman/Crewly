import { prisma } from "@/lib/db";
import { round2 } from "@/lib/utils";
import { assertCan, audit, notifyEmployee } from "../guard";
import { DomainError, ForbiddenError, type Ctx } from "../types";
import { createEmployee, type EmployeeInput } from "./employee.service";

// ───────────── Recruitment ─────────────

export const STAGES = ["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "HIRED", "REJECTED"] as const;
export type Stage = (typeof STAGES)[number];

/** Allowed transitions: forward one or more stages, or reject from anywhere except HIRED; rejected can be revived to SCREENING. */
export function canMoveStage(from: Stage, to: Stage): boolean {
  if (from === to) return false;
  if (from === "HIRED") return false;
  if (to === "REJECTED") return true;
  if (from === "REJECTED") return to === "SCREENING";
  if (to === "HIRED") return from === "OFFER";
  return STAGES.indexOf(to) > STAGES.indexOf(from) || STAGES.indexOf(to) === STAGES.indexOf(from) - 1;
}

export async function createJob(
  ctx: Ctx,
  input: { title: string; departmentId?: string | null; location: string; employmentType: string; workMode: string; salaryMin?: number | null; salaryMax?: number | null; headcount: number; description?: string; closingDate?: Date | null },
) {
  assertCan(ctx, "recruitment.manage");
  if (!input.title) throw new DomainError("Job title is required.");
  if (input.salaryMin && input.salaryMax && input.salaryMin > input.salaryMax) throw new DomainError("Minimum salary can't exceed maximum.");
  if (input.headcount < 1) throw new DomainError("Headcount must be at least 1.");
  return prisma.jobOpening.create({ data: { tenantId: ctx.tenantId, ...input } });
}

export async function addCandidate(ctx: Ctx, input: { jobId: string; name: string; email: string; phone?: string; source: string; expectedSalary?: number | null; currentCompany?: string; noticePeriod?: string; notes?: string }) {
  assertCan(ctx, "recruitment.manage");
  const job = await prisma.jobOpening.findFirst({ where: { id: input.jobId, tenantId: ctx.tenantId } });
  if (!job) throw new DomainError("Job not found.");
  if (job.status === "CLOSED") throw new DomainError("This job is closed.");
  if (await prisma.candidate.findFirst({ where: { jobId: job.id, email: input.email.toLowerCase() } })) throw new DomainError("This candidate already applied for this job.");
  return prisma.candidate.create({ data: { tenantId: ctx.tenantId, ...input, email: input.email.toLowerCase() } });
}

export async function moveCandidate(ctx: Ctx, id: string, to: Stage) {
  assertCan(ctx, "recruitment.manage");
  const c = await prisma.candidate.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!c) throw new DomainError("Candidate not found.");
  if (to === "HIRED") throw new DomainError("Use 'Hire' to convert the candidate into an employee.");
  if (!canMoveStage(c.stage as Stage, to)) throw new DomainError(`Can't move from ${c.stage} to ${to}.`);
  return prisma.candidate.update({ where: { id }, data: { stage: to } });
}

export async function scheduleInterview(ctx: Ctx, input: { candidateId: string; scheduledAt: Date; mode: string; interviewer: string }) {
  assertCan(ctx, "recruitment.manage");
  const c = await prisma.candidate.findFirst({ where: { id: input.candidateId, tenantId: ctx.tenantId } });
  if (!c) throw new DomainError("Candidate not found.");
  if (["HIRED", "REJECTED"].includes(c.stage)) throw new DomainError("Candidate is no longer in the pipeline.");
  const iv = await prisma.interview.create({ data: input });
  if (["APPLIED", "SCREENING"].includes(c.stage)) await prisma.candidate.update({ where: { id: c.id }, data: { stage: "INTERVIEW" } });
  return iv;
}

export async function scoreInterview(ctx: Ctx, id: string, score: number, feedback: string, recommendation: string) {
  assertCan(ctx, "recruitment.manage");
  if (score < 1 || score > 5) throw new DomainError("Score must be 1 – 5.");
  const iv = await prisma.interview.findUnique({ where: { id }, include: { candidate: true } });
  if (!iv || iv.candidate.tenantId !== ctx.tenantId) throw new DomainError("Interview not found.");
  await prisma.interview.update({ where: { id }, data: { score, feedback, recommendation } });
  const all = await prisma.interview.findMany({ where: { candidateId: iv.candidateId, score: { not: null } } });
  const avg = Math.round(all.reduce((s, i) => s + (i.score ?? 0), 0) / all.length);
  await prisma.candidate.update({ where: { id: iv.candidateId }, data: { rating: avg } });
}

/** Hire: candidate must be at OFFER; creates the employee (with onboarding) and fills the job if headcount reached. */
export async function hireCandidate(ctx: Ctx, candidateId: string, employee: EmployeeInput) {
  assertCan(ctx, "recruitment.manage");
  const c = await prisma.candidate.findFirst({ where: { id: candidateId, tenantId: ctx.tenantId }, include: { job: true } });
  if (!c) throw new DomainError("Candidate not found.");
  if (c.stage !== "OFFER") throw new DomainError("Only candidates with an accepted offer can be hired.");
  const emp = await createEmployee(ctx, { ...employee, fullName: employee.fullName || c.name, email: employee.email || c.email, departmentId: employee.departmentId ?? c.job.departmentId });
  await prisma.candidate.update({ where: { id: c.id }, data: { stage: "HIRED", hiredEmployeeId: emp.id } });
  const hired = await prisma.candidate.count({ where: { jobId: c.jobId, stage: "HIRED" } });
  if (hired >= c.job.headcount) await prisma.jobOpening.update({ where: { id: c.jobId }, data: { status: "CLOSED" } });
  await audit(ctx, "CREATE", "Candidate", c.id, `Hired ${c.name} for ${c.job.title}`);
  return emp;
}

// ───────────── Performance ─────────────

export const RATING_LABELS: Record<number, string> = {
  1: "Needs improvement",
  2: "Partially meets",
  3: "Meets expectations",
  4: "Exceeds expectations",
  5: "Outstanding",
};

/** Weighted goal score (0–100) given progress and weights. */
export function weightedGoalScore(goals: { weight: number; progress: number }[]) {
  const totalWeight = goals.reduce((s, g) => s + g.weight, 0);
  if (!totalWeight) return 0;
  return round2(goals.reduce((s, g) => s + (g.weight * Math.min(100, g.progress)) / 100, 0) * (100 / totalWeight));
}

/** Final rating: 70% manager rating, 30% goal achievement mapped to 1–5, rounded to 0.5. */
export function finalRating(managerRating: number, goalScore: number) {
  const goalRating = 1 + (Math.min(100, Math.max(0, goalScore)) / 100) * 4;
  return Math.round((0.7 * managerRating + 0.3 * goalRating) * 2) / 2;
}

export async function setGoal(ctx: Ctx, input: { employeeId: string; cycleId?: string | null; title: string; kind: string; weight: number; target?: string; dueDate?: Date | null }) {
  if (input.employeeId !== ctx.employeeId) assertCan(ctx, "performance.review");
  if (input.weight <= 0 || input.weight > 100) throw new DomainError("Weight must be between 1 and 100.");
  const existing = await prisma.goal.findMany({ where: { employeeId: input.employeeId, cycleId: input.cycleId ?? null } });
  const total = existing.reduce((s, g) => s + g.weight, 0) + input.weight;
  if (total > 100) throw new DomainError(`Goal weights would total ${total}% — keep it at 100% or below.`);
  return prisma.goal.create({ data: { tenantId: ctx.tenantId, ...input } });
}

export async function updateGoalProgress(ctx: Ctx, id: string, progress: number, status?: string) {
  const g = await prisma.goal.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!g) throw new DomainError("Goal not found.");
  if (g.employeeId !== ctx.employeeId) assertCan(ctx, "performance.review");
  if (progress < 0 || progress > 100) throw new DomainError("Progress must be 0 – 100%.");
  return prisma.goal.update({ where: { id }, data: { progress, status: status ?? (progress >= 100 ? "DONE" : g.status) } });
}

export async function launchCycle(ctx: Ctx, input: { name: string; type: string; startDate: Date; endDate: Date; employeeIds?: string[] }) {
  assertCan(ctx, "performance.manage");
  if (input.endDate <= input.startDate) throw new DomainError("Cycle end must be after start.");
  const cycle = await prisma.reviewCycle.create({ data: { tenantId: ctx.tenantId, name: input.name, type: input.type, startDate: input.startDate, endDate: input.endDate } });
  const employees = await prisma.employee.findMany({
    where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROBATION"] }, ...(input.employeeIds ? { id: { in: input.employeeIds } } : {}) },
  });
  for (const e of employees) {
    const reviewer = e.managerId ? await prisma.user.findUnique({ where: { employeeId: e.managerId } }) : null;
    await prisma.performanceReview.create({ data: { tenantId: ctx.tenantId, cycleId: cycle.id, employeeId: e.id, reviewerId: reviewer?.id ?? null } });
  }
  return cycle;
}

export async function submitSelfReview(ctx: Ctx, reviewId: string, rating: number, comment: string) {
  const r = await prisma.performanceReview.findFirst({ where: { id: reviewId, tenantId: ctx.tenantId } });
  if (!r) throw new DomainError("Review not found.");
  if (r.employeeId !== ctx.employeeId) throw new ForbiddenError("Only the employee can submit their self-review.");
  if (r.status !== "SELF_REVIEW") throw new DomainError("Self-review is already submitted.");
  if (rating < 1 || rating > 5) throw new DomainError("Rating must be 1 – 5.");
  return prisma.performanceReview.update({ where: { id: reviewId }, data: { selfRating: rating, selfComment: comment, status: "MANAGER_REVIEW" } });
}

export async function submitManagerReview(ctx: Ctx, reviewId: string, input: { rating: number; comment: string; strengths?: string; improvements?: string }) {
  const r = await prisma.performanceReview.findFirst({ where: { id: reviewId, tenantId: ctx.tenantId }, include: { employee: true } });
  if (!r) throw new DomainError("Review not found.");
  const isReviewer = r.reviewerId === ctx.userId || ctx.role === "HR_ADMIN" || ctx.role === "OWNER";
  if (!isReviewer) throw new ForbiddenError("Only the assigned reviewer or HR can submit this review.");
  if (r.employeeId === ctx.employeeId) throw new ForbiddenError("You can't review yourself.");
  if (r.status !== "MANAGER_REVIEW") throw new DomainError(r.status === "SELF_REVIEW" ? "Waiting for the employee's self-review." : "Manager review already submitted.");
  if (input.rating < 1 || input.rating > 5) throw new DomainError("Rating must be 1 – 5.");
  const goals = await prisma.goal.findMany({ where: { employeeId: r.employeeId, cycleId: r.cycleId } });
  const final = finalRating(input.rating, goals.length ? weightedGoalScore(goals) : input.rating * 20);
  const updated = await prisma.performanceReview.update({
    where: { id: reviewId },
    data: { managerRating: input.rating, managerComment: input.comment, strengths: input.strengths, improvements: input.improvements, finalRating: final, status: "CALIBRATION" },
  });
  await notifyEmployee(r.employeeId, "Your manager has completed your review", undefined, "/me");
  return updated;
}

export async function calibrate(ctx: Ctx, reviewId: string, finalRatingValue: number) {
  assertCan(ctx, "performance.manage");
  if (finalRatingValue < 1 || finalRatingValue > 5) throw new DomainError("Rating must be 1 – 5.");
  const r = await prisma.performanceReview.findFirst({ where: { id: reviewId, tenantId: ctx.tenantId } });
  if (!r || r.status !== "CALIBRATION") throw new DomainError("Review isn't ready for calibration.");
  return prisma.performanceReview.update({ where: { id: reviewId }, data: { finalRating: finalRatingValue, status: "COMPLETED" } });
}

// ───────────── Training & HRD Corp ─────────────

export async function createProgram(
  ctx: Ctx,
  input: { title: string; provider: string; category: string; mode: string; startDate: Date; endDate: Date; hours: number; costPerPax: number; capacity: number; hrdClaimable: boolean },
) {
  assertCan(ctx, "training.manage");
  if (input.endDate < input.startDate) throw new DomainError("End date must be on or after start date.");
  if (input.capacity < 1) throw new DomainError("Capacity must be at least 1.");
  return prisma.trainingProgram.create({ data: { tenantId: ctx.tenantId, ...input } });
}

export async function enroll(ctx: Ctx, programId: string, employeeId: string) {
  if (employeeId !== ctx.employeeId) assertCan(ctx, "training.manage");
  const p = await prisma.trainingProgram.findFirst({ where: { id: programId, tenantId: ctx.tenantId }, include: { enrollments: true } });
  if (!p) throw new DomainError("Programme not found.");
  if (["COMPLETED", "CANCELLED"].includes(p.status)) throw new DomainError("Enrolment is closed for this programme.");
  if (p.enrollments.some((e) => e.employeeId === employeeId)) throw new DomainError("Already enrolled.");
  if (p.enrollments.length >= p.capacity) throw new DomainError("This programme is full.");
  return prisma.trainingEnrollment.create({ data: { programId, employeeId } });
}

export async function completeEnrollment(ctx: Ctx, enrollmentId: string, status: "COMPLETED" | "NO_SHOW" | "ATTENDED", score?: number) {
  assertCan(ctx, "training.manage");
  const en = await prisma.trainingEnrollment.findUnique({ where: { id: enrollmentId }, include: { program: true } });
  if (!en || en.program.tenantId !== ctx.tenantId) throw new DomainError("Enrolment not found.");
  return prisma.trainingEnrollment.update({ where: { id: enrollmentId }, data: { status, score: score ?? null } });
}

/** HRD Corp levy balance: levy paid via payroll for the year minus claimable training costs utilised. */
export async function hrdLevyBalance(tenantId: string, year: number) {
  const [levy, programs] = await Promise.all([
    prisma.payslip.aggregate({ where: { tenantId, period: { startsWith: `${year}-` }, run: { status: { in: ["APPROVED", "PAID", "LOCKED"] } } }, _sum: { hrdf: true } }),
    prisma.trainingProgram.findMany({ where: { tenantId, hrdClaimable: true, startDate: { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 31)) } }, include: { enrollments: true } }),
  ]);
  const utilised = programs
    .filter((p) => ["APPROVED", "CLAIMED"].includes(p.hrdClaimStatus))
    .reduce((s, p) => s + p.costPerPax * p.enrollments.filter((e) => e.status !== "NO_SHOW").length, 0);
  const contributed = round2(levy._sum.hrdf ?? 0);
  return { contributed, utilised: round2(utilised), balance: round2(contributed - utilised) };
}
