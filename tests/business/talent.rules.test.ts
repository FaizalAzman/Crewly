import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  addCandidate,
  calibrate,
  completeEnrollment,
  createJob,
  createProgram,
  enroll,
  hireCandidate,
  hrdLevyBalance,
  launchCycle,
  moveCandidate,
  scheduleInterview,
  scoreInterview,
  setGoal,
  submitManagerReview,
  submitSelfReview,
  updateGoalProgress,
} from "@/server/services/talent.service";
import { D, makeWorld, nric, type World } from "./factory";

let w: World;
beforeAll(async () => {
  w = await makeWorld();
});

describe("Recruitment pipeline", () => {
  it("validates job openings", async () => {
    await expect(createJob(w.hr, { title: "", location: "KL", employmentType: "PERMANENT", workMode: "HYBRID", headcount: 1 })).rejects.toThrow(/title/);
    await expect(createJob(w.hr, { title: "Dev", location: "KL", employmentType: "PERMANENT", workMode: "HYBRID", headcount: 1, salaryMin: 9000, salaryMax: 5000 })).rejects.toThrow(/Minimum salary/);
    await expect(createJob(w.hr, { title: "Dev", location: "KL", employmentType: "PERMANENT", workMode: "HYBRID", headcount: 0 })).rejects.toThrow(/Headcount/);
  });

  it("blocks duplicate applications and applications to closed jobs", async () => {
    const job = await createJob(w.hr, { title: "QA", location: "KL", employmentType: "PERMANENT", workMode: "ONSITE", headcount: 1 });
    await addCandidate(w.hr, { jobId: job.id, name: "Mei", email: "Mei@x.com", source: "JOBSTREET" });
    await expect(addCandidate(w.hr, { jobId: job.id, name: "Mei", email: "mei@x.com", source: "LINKEDIN" })).rejects.toThrow(/already applied/);
    await prisma.jobOpening.update({ where: { id: job.id }, data: { status: "CLOSED" } });
    await expect(addCandidate(w.hr, { jobId: job.id, name: "Sam", email: "sam@x.com", source: "LINKEDIN" })).rejects.toThrow(/closed/);
  });

  it("enforces stage transitions and hiring only via the hire flow", async () => {
    const job = await createJob(w.hr, { title: "Designer", location: "KL", employmentType: "PERMANENT", workMode: "HYBRID", headcount: 1 });
    const c = await addCandidate(w.hr, { jobId: job.id, name: "Ain", email: "ain@x.com", source: "HIREDLY" });
    await expect(moveCandidate(w.hr, c.id, "HIRED")).rejects.toThrow(/Hire/);
    await moveCandidate(w.hr, c.id, "SCREENING");
    await moveCandidate(w.hr, c.id, "REJECTED");
    await expect(moveCandidate(w.hr, c.id, "OFFER")).rejects.toThrow(/Can't move/);
    await moveCandidate(w.hr, c.id, "SCREENING"); // revive
  });

  it("scheduling an interview moves early-stage candidates to INTERVIEW; scorecards update rating", async () => {
    const job = await createJob(w.hr, { title: "PM", location: "KL", employmentType: "PERMANENT", workMode: "HYBRID", headcount: 1 });
    const c = await addCandidate(w.hr, { jobId: job.id, name: "Kai", email: "kai@x.com", source: "REFERRAL" });
    const iv = await scheduleInterview(w.hr, { candidateId: c.id, scheduledAt: new Date(), mode: "VIDEO", interviewer: "Raj" });
    expect((await prisma.candidate.findUniqueOrThrow({ where: { id: c.id } })).stage).toBe("INTERVIEW");
    await expect(scoreInterview(w.hr, iv.id, 6, "x", "HIRE")).rejects.toThrow(/1 – 5/);
    await scoreInterview(w.hr, iv.id, 4, "Strong product sense", "HIRE");
    expect((await prisma.candidate.findUniqueOrThrow({ where: { id: c.id } })).rating).toBe(4);
  });

  it("hiring requires OFFER, creates an employee with onboarding, and closes the job when filled", async () => {
    const job = await createJob(w.hr, { title: "Backend Dev", location: "KL", employmentType: "PERMANENT", workMode: "HYBRID", headcount: 1 });
    const c = await addCandidate(w.hr, { jobId: job.id, name: "Farid", email: "farid@x.com", source: "LINKEDIN" });
    const emp = { fullName: "Farid bin Ali", email: "farid@x.com", icNo: nric(), jobTitle: "Backend Dev", joinDate: D("2026-11-02"), basicSalary: 7000 };
    await expect(hireCandidate(w.hr, c.id, emp)).rejects.toThrow(/accepted offer/);
    await moveCandidate(w.hr, c.id, "SCREENING");
    await moveCandidate(w.hr, c.id, "INTERVIEW");
    await moveCandidate(w.hr, c.id, "OFFER");
    const e = await hireCandidate(w.hr, c.id, emp);
    expect(e.jobTitle).toBe("Backend Dev");
    expect((await prisma.candidate.findUniqueOrThrow({ where: { id: c.id } })).hiredEmployeeId).toBe(e.id);
    expect((await prisma.jobOpening.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("CLOSED");
    expect(await prisma.checklist.count({ where: { employeeId: e.id, type: "ONBOARDING" } })).toBe(1);
  });

  it("managers can't manage recruitment", async () => {
    await expect(createJob(w.manager, { title: "X", location: "KL", employmentType: "PERMANENT", workMode: "HYBRID", headcount: 1 })).rejects.toThrow(/permission/);
  });
});

describe("Performance management", () => {
  it("goal weights per cycle can't exceed 100% and progress is 0–100", async () => {
    const cycle = await prisma.reviewCycle.create({ data: { tenantId: w.tenantId, name: "Goals test", startDate: D("2026-01-01"), endDate: D("2026-12-31") } });
    const e = await w.emp();
    await setGoal(w.hr, { employeeId: e.id, cycleId: cycle.id, title: "A", kind: "KPI", weight: 60 });
    await expect(setGoal(w.hr, { employeeId: e.id, cycleId: cycle.id, title: "B", kind: "KPI", weight: 50 })).rejects.toThrow(/110%/);
    const g = await setGoal(w.hr, { employeeId: e.id, cycleId: cycle.id, title: "B", kind: "OKR", weight: 40 });
    await expect(updateGoalProgress(w.hr, g.id, 120)).rejects.toThrow(/0 – 100/);
    expect((await updateGoalProgress(w.hr, g.id, 100)).status).toBe("DONE");
  });

  it("employees set their own goals; not others'", async () => {
    await setGoal(w.employee, { employeeId: w.employeeId, title: "Learn Go", kind: "OKR", weight: 10 });
    await expect(setGoal(w.employee, { employeeId: w.managerEmployeeId, title: "x", kind: "KPI", weight: 10 })).rejects.toThrow(/permission/);
  });

  it("runs the review flow: self → manager → calibration", async () => {
    const cycle = await launchCycle(w.hr, { name: "H2 2026", type: "MID_YEAR", startDate: D("2026-07-01"), endDate: D("2026-12-31"), employeeIds: [w.employeeId] });
    const review = await prisma.performanceReview.findFirstOrThrow({ where: { cycleId: cycle.id, employeeId: w.employeeId } });
    expect(review.reviewerId).toBe(w.manager.userId);

    await expect(submitManagerReview(w.manager, review.id, { rating: 4, comment: "Good" })).rejects.toThrow(/self-review/);
    await expect(submitSelfReview(w.manager, review.id, 4, "x")).rejects.toThrow(/Only the employee/);
    await expect(submitSelfReview(w.employee, review.id, 7, "x")).rejects.toThrow(/1 – 5/);
    await submitSelfReview(w.employee, review.id, 4, "Delivered a lot");
    await expect(submitSelfReview(w.employee, review.id, 4, "again")).rejects.toThrow(/already/);

    const outsider = await w.ctxFor((await w.emp()).id, "MANAGER");
    await expect(submitManagerReview(outsider, review.id, { rating: 4, comment: "x" })).rejects.toThrow(/assigned reviewer/);
    const done = await submitManagerReview(w.manager, review.id, { rating: 4, comment: "Solid" });
    expect(done.status).toBe("CALIBRATION");
    expect(done.finalRating).toBeGreaterThanOrEqual(1);

    await expect(calibrate(w.manager, review.id, 4)).rejects.toThrow(/permission/);
    const final = await calibrate(w.hr, review.id, 4.5);
    expect(final).toMatchObject({ status: "COMPLETED", finalRating: 4.5 });
  });

  it("launching a cycle validates dates", async () => {
    await expect(launchCycle(w.hr, { name: "Bad", type: "ANNUAL", startDate: D("2026-12-31"), endDate: D("2026-01-01") })).rejects.toThrow(/after start/);
  });
});

describe("Training & HRD Corp", () => {
  it("respects capacity and prevents double enrolment", async () => {
    const p = await createProgram(w.hr, { title: "Excel", provider: "X", category: "TECHNICAL", mode: "ONLINE", startDate: D("2026-11-02"), endDate: D("2026-11-02"), hours: 8, costPerPax: 500, capacity: 1, hrdClaimable: true });
    const a = await w.emp();
    const b = await w.emp();
    await enroll(w.hr, p.id, a.id);
    await expect(enroll(w.hr, p.id, a.id)).rejects.toThrow(/Already/);
    await expect(enroll(w.hr, p.id, b.id)).rejects.toThrow(/full/);
  });

  it("employees can self-enrol but not enrol others", async () => {
    const p = await createProgram(w.hr, { title: "Soft skills", provider: "Y", category: "SOFT_SKILLS", mode: "CLASSROOM", startDate: D("2026-11-10"), endDate: D("2026-11-10"), hours: 8, costPerPax: 0, capacity: 10, hrdClaimable: false });
    await enroll(w.employee, p.id, w.employeeId);
    await expect(enroll(w.employee, p.id, w.managerEmployeeId)).rejects.toThrow(/permission/);
  });

  it("programme end must not precede start; closed programmes refuse enrolment", async () => {
    await expect(createProgram(w.hr, { title: "Bad", provider: "Z", category: "TECHNICAL", mode: "ONLINE", startDate: D("2026-11-10"), endDate: D("2026-11-01"), hours: 8, costPerPax: 0, capacity: 5, hrdClaimable: false })).rejects.toThrow(/End date/);
    const p = await createProgram(w.hr, { title: "Done", provider: "Z", category: "TECHNICAL", mode: "ONLINE", startDate: D("2026-01-10"), endDate: D("2026-01-10"), hours: 8, costPerPax: 0, capacity: 5, hrdClaimable: false });
    await prisma.trainingProgram.update({ where: { id: p.id }, data: { status: "COMPLETED" } });
    await expect(enroll(w.hr, p.id, w.employeeId)).rejects.toThrow(/closed/);
  });

  it("HRD levy balance = levy paid − approved/claimed training costs (excluding no-shows)", async () => {
    const tw = await makeWorld();
    const run = await prisma.payrollRun.create({ data: { tenantId: tw.tenantId, companyId: tw.companyId, period: "2026-03", status: "PAID", payDate: D("2026-03-28") } });
    await prisma.payslip.create({
      data: { tenantId: tw.tenantId, runId: run.id, employeeId: tw.employeeId, period: "2026-03", basicSalary: 5000, proratedBasic: 5000, workingDays: 22, daysPaid: 22, totalEarnings: 5000, grossPay: 5000, epfWages: 5000, socsoWages: 5000, epfEE: 550, epfER: 650, socsoEE: 0, socsoER: 0, eisEE: 0, eisER: 0, pcb: 0, hrdf: 1000, totalDeductions: 550, netPay: 4450, employerCost: 6650 },
    });
    const p = await createProgram(tw.hr, { title: "Claimable", provider: "HRDC", category: "TECHNICAL", mode: "CLASSROOM", startDate: D("2026-04-01"), endDate: D("2026-04-02"), hours: 16, costPerPax: 300, capacity: 5, hrdClaimable: true });
    await prisma.trainingProgram.update({ where: { id: p.id }, data: { hrdClaimStatus: "APPROVED" } });
    const a = await enroll(tw.hr, p.id, tw.employeeId);
    const b = await enroll(tw.hr, p.id, tw.managerEmployeeId);
    await completeEnrollment(tw.hr, a.id, "COMPLETED");
    await completeEnrollment(tw.hr, b.id, "NO_SHOW");
    expect(await hrdLevyBalance(tw.tenantId, 2026)).toEqual({ contributed: 1000, utilised: 300, balance: 700 });
  });
});
