import { prisma } from "@/lib/db";
import { round2 } from "@/lib/utils";
import { MINIMUM_WAGE } from "@/lib/statutory/employment-act";
import { assertActOnEmployee, assertCan, audit, claimTransition, notifyEmployee } from "../guard";
import { can } from "@/lib/permissions";
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

/** Shared checks for job openings (create & edit). */
async function validateJobInput(ctx: Ctx, input: { title: string; departmentId?: string | null; employmentType: string; workMode: string; salaryMin?: number | null; salaryMax?: number | null; headcount: number }) {
  if (!input.title?.trim()) throw new DomainError("Job title is required.");
  if (!["PERMANENT", "CONTRACT", "PROBATION", "INTERN", "PART_TIME"].includes(input.employmentType)) throw new DomainError("Pick an employment type.");
  if (!["ONSITE", "HYBRID", "REMOTE"].includes(input.workMode)) throw new DomainError("Pick a work mode.");
  if (input.salaryMin && input.salaryMax && input.salaryMin > input.salaryMax) throw new DomainError("Minimum salary can't exceed maximum.");
  // Minimum Wages Order: advertised full-time pay can't be below the national minimum wage.
  if (["PERMANENT", "CONTRACT", "PROBATION"].includes(input.employmentType) && input.salaryMin != null && input.salaryMin < MINIMUM_WAGE) {
    throw new DomainError(`Advertised salary can't be below the minimum wage of RM${MINIMUM_WAGE.toLocaleString()}.`);
  }
  if (!Number.isInteger(input.headcount) || input.headcount < 1) throw new DomainError("Headcount must be a whole number, at least 1.");
  if (input.departmentId && !(await prisma.department.findFirst({ where: { id: input.departmentId, tenantId: ctx.tenantId } }))) throw new DomainError("Department not found.");
}

export async function createJob(
  ctx: Ctx,
  input: { title: string; departmentId?: string | null; location: string; employmentType: string; workMode: string; salaryMin?: number | null; salaryMax?: number | null; headcount: number; description?: string; closingDate?: Date | null },
) {
  assertCan(ctx, "recruitment.manage");
  await validateJobInput(ctx, input);
  return prisma.jobOpening.create({ data: { tenantId: ctx.tenantId, ...input } });
}

export async function addCandidate(ctx: Ctx, input: { jobId: string; name: string; email: string; phone?: string; source: string; expectedSalary?: number | null; currentCompany?: string; noticePeriod?: string; notes?: string }) {
  assertCan(ctx, "recruitment.manage");
  const job = await prisma.jobOpening.findFirst({ where: { id: input.jobId, tenantId: ctx.tenantId } });
  if (!job) throw new DomainError("Job not found.");
  if (job.status === "CLOSED") throw new DomainError("This job is closed.");
  if (!input.name?.trim()) throw new DomainError("Candidate name is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email ?? "")) throw new DomainError("Enter a valid email address.");
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
  if (!(input.scheduledAt instanceof Date) || Number.isNaN(input.scheduledAt.getTime())) throw new DomainError("Pick the interview date and time.");
  if (!["VIDEO", "ONSITE", "PHONE"].includes(input.mode)) throw new DomainError("Pick an interview mode.");
  if (!input.interviewer?.trim()) throw new DomainError("Who is interviewing?");
  const iv = await prisma.interview.create({ data: input });
  if (["APPLIED", "SCREENING"].includes(c.stage)) await prisma.candidate.update({ where: { id: c.id }, data: { stage: "INTERVIEW" } });
  return iv;
}

export async function scoreInterview(ctx: Ctx, id: string, score: number, feedback: string, recommendation: string) {
  assertCan(ctx, "recruitment.manage");
  if (!Number.isInteger(score) || score < 1 || score > 5) throw new DomainError("Score must be 1 – 5.");
  if (recommendation && !["STRONG_HIRE", "HIRE", "NO_HIRE"].includes(recommendation)) throw new DomainError("Pick a recommendation.");
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

export const GOAL_STATUSES = ["ON_TRACK", "AT_RISK", "OFF_TRACK", "DONE"];

export async function setGoal(ctx: Ctx, input: { employeeId: string; cycleId?: string | null; title: string; kind: string; weight: number; target?: string; dueDate?: Date | null }) {
  await assertActOnEmployee(ctx, input.employeeId, "performance.review");
  if (!input.title?.trim()) throw new DomainError("Give the goal a title.");
  if (!["KPI", "OKR"].includes(input.kind)) throw new DomainError("Goal type must be KPI or OKR.");
  if (!Number.isFinite(input.weight) || input.weight <= 0 || input.weight > 100) throw new DomainError("Weight must be between 1 and 100.");
  if (input.cycleId && !(await prisma.reviewCycle.findFirst({ where: { id: input.cycleId, tenantId: ctx.tenantId } }))) throw new DomainError("Review cycle not found.");
  const existing = await prisma.goal.findMany({ where: { employeeId: input.employeeId, cycleId: input.cycleId ?? null } });
  const total = existing.reduce((s, g) => s + g.weight, 0) + input.weight;
  if (total > 100) throw new DomainError(`Goal weights would total ${total}% — keep it at 100% or below.`);
  return prisma.goal.create({ data: { tenantId: ctx.tenantId, ...input } });
}

export async function updateGoalProgress(ctx: Ctx, id: string, progress: number, status?: string) {
  const g = await prisma.goal.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!g) throw new DomainError("Goal not found.");
  await assertActOnEmployee(ctx, g.employeeId, "performance.review");
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) throw new DomainError("Progress must be 0 – 100%.");
  if (status && !GOAL_STATUSES.includes(status)) throw new DomainError("Unknown goal status.");
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
  await claimTransition(
    prisma.performanceReview.updateMany({ where: { id: reviewId, status: "SELF_REVIEW" }, data: { selfRating: rating, selfComment: comment, status: "MANAGER_REVIEW" } }),
    "Self-review is already submitted.",
  );
  return prisma.performanceReview.findUniqueOrThrow({ where: { id: reviewId } });
}

export async function submitManagerReview(ctx: Ctx, reviewId: string, input: { rating: number; comment: string; strengths?: string; improvements?: string }) {
  const r = await prisma.performanceReview.findFirst({ where: { id: reviewId, tenantId: ctx.tenantId }, include: { employee: true } });
  if (!r) throw new DomainError("Review not found.");
  const isReviewer = r.reviewerId === ctx.userId || can(ctx, "performance.manage");
  if (!isReviewer) throw new ForbiddenError("Only the assigned reviewer or HR can submit this review.");
  if (r.employeeId === ctx.employeeId) throw new ForbiddenError("You can't review yourself.");
  if (r.status !== "MANAGER_REVIEW") throw new DomainError(r.status === "SELF_REVIEW" ? "Waiting for the employee's self-review." : "Manager review already submitted.");
  if (input.rating < 1 || input.rating > 5) throw new DomainError("Rating must be 1 – 5.");
  const goals = await prisma.goal.findMany({ where: { employeeId: r.employeeId, cycleId: r.cycleId } });
  const final = finalRating(input.rating, goals.length ? weightedGoalScore(goals) : input.rating * 20);
  await claimTransition(
    prisma.performanceReview.updateMany({
      where: { id: reviewId, status: "MANAGER_REVIEW" },
      data: { managerRating: input.rating, managerComment: input.comment, strengths: input.strengths, improvements: input.improvements, finalRating: final, status: "CALIBRATION" },
    }),
    "Manager review already submitted.",
  );
  const updated = await prisma.performanceReview.findUniqueOrThrow({ where: { id: reviewId } });
  await notifyEmployee(r.employeeId, "Your manager has completed your review", undefined, "/me");
  return updated;
}

export async function calibrate(ctx: Ctx, reviewId: string, finalRatingValue: number) {
  assertCan(ctx, "performance.manage");
  if (finalRatingValue < 1 || finalRatingValue > 5) throw new DomainError("Rating must be 1 – 5.");
  const r = await prisma.performanceReview.findFirst({ where: { id: reviewId, tenantId: ctx.tenantId } });
  if (!r || r.status !== "CALIBRATION") throw new DomainError("Review isn't ready for calibration.");
  await claimTransition(prisma.performanceReview.updateMany({ where: { id: reviewId, status: "CALIBRATION" }, data: { finalRating: finalRatingValue, status: "COMPLETED" } }), "This review was already calibrated.");
  return prisma.performanceReview.findUniqueOrThrow({ where: { id: reviewId } });
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
  const emp = await assertActOnEmployee(ctx, employeeId, "training.manage");
  if (["RESIGNED", "TERMINATED", "RETIRED"].includes(emp.status)) throw new DomainError("Former employees can't be enrolled.");
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

export async function updateJob(
  ctx: Ctx,
  id: string,
  input: { title: string; departmentId?: string | null; location: string; employmentType: string; workMode: string; salaryMin?: number | null; salaryMax?: number | null; headcount: number; description?: string; closingDate?: Date | null },
) {
  assertCan(ctx, "recruitment.manage");
  const job = await prisma.jobOpening.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!job) throw new DomainError("Job not found.");
  await validateJobInput(ctx, input);
  return prisma.jobOpening.update({ where: { id }, data: input });
}

export async function updateCandidateNotes(ctx: Ctx, id: string, input: { notes?: string | null; resumeUrl?: string | null; expectedSalary?: number | null }) {
  assertCan(ctx, "recruitment.manage");
  const c = await prisma.candidate.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!c) throw new DomainError("Candidate not found.");
  return prisma.candidate.update({ where: { id }, data: { notes: input.notes ?? c.notes, resumeUrl: input.resumeUrl ?? c.resumeUrl, expectedSalary: input.expectedSalary ?? c.expectedSalary } });
}

/** Public careers page application (no login). The job must be open and not past its closing date. */
export async function applyToJob(
  tenantSlug: string,
  jobId: string,
  input: { name: string; email: string; phone?: string | null; expectedSalary?: number | null; noticePeriod?: string | null; coverNote?: string | null; resumeUrl?: string | null },
  today: Date = new Date(),
) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) throw new DomainError("Company not found.");
  const job = await prisma.jobOpening.findFirst({ where: { id: jobId, tenantId: tenant.id } });
  if (!job || job.status !== "OPEN") throw new DomainError("This position is no longer accepting applications.");
  if (job.closingDate && job.closingDate < new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))) {
    throw new DomainError("Applications for this position have closed.");
  }
  const email = input.email.trim().toLowerCase();
  if (input.name.trim().length < 2) throw new DomainError("Please enter your full name.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new DomainError("Please enter a valid email.");
  if (await prisma.candidate.findFirst({ where: { jobId, email } })) throw new DomainError("You've already applied for this role. We'll be in touch!");
  const c = await prisma.candidate.create({
    data: {
      tenantId: tenant.id,
      jobId,
      name: input.name.trim(),
      email,
      phone: input.phone ?? null,
      source: "CAREERS_PAGE",
      expectedSalary: input.expectedSalary ?? null,
      noticePeriod: input.noticePeriod ?? null,
      notes: input.coverNote ? `Cover note: ${input.coverNote}` : null,
      resumeUrl: input.resumeUrl ?? null,
    },
  });
  const recruiters = await prisma.user.findMany({ where: { tenantId: tenant.id, active: true, role: { in: ["OWNER", "HR_ADMIN"] } } });
  for (const u of recruiters) await prisma.notification.create({ data: { userId: u.id, title: `New applicant for ${job.title}`, body: c.name, link: `/recruitment/${job.id}` } });
  return c;
}
