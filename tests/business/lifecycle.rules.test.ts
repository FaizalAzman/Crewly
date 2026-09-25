import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { approveSeparation, completeSeparation, createSeparation, markCp22a, previewSeparation, toggleTask, withdrawSeparation, addTask, checklistProgress } from "@/server/services/lifecycle.service";
import { assignAsset, returnAsset } from "@/server/services/relations.service";
import { D, makeWorld, type World } from "./factory";

let w: World;
beforeAll(async () => {
  w = await makeWorld();
});

describe("Separation calculations", () => {
  it("minimum notice follows EA s.12: 4 / 6 / 8 weeks", async () => {
    const a = await w.emp({ joinDate: D("2025-06-02") });
    const b = await w.emp({ joinDate: D("2023-01-02") });
    const c = await w.emp({ joinDate: D("2019-01-02") });
    const p = (id: string) => previewSeparation(w.hr, { employeeId: id, type: "RESIGNATION", noticeDate: D("2026-09-01"), lastWorkingDate: D("2026-10-31") });
    expect((await p(a.id)).requiredNoticeDays).toBe(28);
    expect((await p(b.id)).requiredNoticeDays).toBe(42);
    expect((await p(c.id)).requiredNoticeDays).toBe(56);
  });

  it("probationers need only 2 weeks", async () => {
    const e = await w.emp({ joinDate: D("2026-08-03"), probationMonths: 3 });
    expect((await previewSeparation(w.hr, { employeeId: e.id, type: "RESIGNATION", noticeDate: D("2026-09-01"), lastWorkingDate: D("2026-09-30") })).requiredNoticeDays).toBe(14);
  });

  it("contractual notice overrides the statutory minimum", async () => {
    const e = await w.emp({ joinDate: D("2025-06-02") });
    await prisma.employee.update({ where: { id: e.id }, data: { noticeWeeks: 12 } });
    expect((await previewSeparation(w.hr, { employeeId: e.id, type: "RESIGNATION", noticeDate: D("2026-09-01"), lastWorkingDate: D("2026-10-31") })).requiredNoticeDays).toBe(84);
  });

  it("resignation shortfall creates an indemnity owed by the employee (negative)", async () => {
    const e = await w.emp({ joinDate: D("2025-06-02"), basicSalary: 3650 });
    const p = await previewSeparation(w.hr, { employeeId: e.id, type: "RESIGNATION", noticeDate: D("2026-09-01"), lastWorkingDate: D("2026-09-15") });
    expect(p.shortfallDays).toBe(14);
    expect(p.noticePayInLieu).toBeCloseTo(-((3650 * 12) / 365) * 14, 2);
  });

  it("employer termination shortfall is paid to the employee (positive)", async () => {
    const e = await w.emp({ joinDate: D("2025-06-02"), basicSalary: 3650 });
    const p = await previewSeparation(w.hr, { employeeId: e.id, type: "TERMINATION", noticeDate: D("2026-09-01"), lastWorkingDate: D("2026-09-15") });
    expect(p.noticePayInLieu).toBeGreaterThan(0);
  });

  it("waived shortfall means no payment either way", async () => {
    const e = await w.emp({ joinDate: D("2025-06-02") });
    const p = await previewSeparation(w.hr, { employeeId: e.id, type: "RESIGNATION", noticeDate: D("2026-09-01"), lastWorkingDate: D("2026-09-05"), waiveShortfall: true });
    expect(p.noticePayInLieu).toBe(0);
  });

  it("termination benefits apply to retrenchment with ≥ 12 months' service, not resignations", async () => {
    const e = await w.emp({ joinDate: D("2023-09-01"), basicSalary: 2600 });
    const retrench = await previewSeparation(w.hr, { employeeId: e.id, type: "RETRENCHMENT", noticeDate: D("2026-07-01"), lastWorkingDate: D("2026-09-01") });
    expect(retrench.terminationBenefitDaysPerYear).toBe(15);
    expect(retrench.terminationBenefit).toBeCloseTo(3 * 15 * 100, 0);
    const resign = await previewSeparation(w.hr, { employeeId: e.id, type: "RESIGNATION", noticeDate: D("2026-07-01"), lastWorkingDate: D("2026-09-01") });
    expect(resign.terminationBenefit).toBe(0);
  });

  it("calculates unused annual leave for encashment", async () => {
    const e = await w.emp({ joinDate: D("2020-01-02"), basicSalary: 2600 }); // 16 days AL, pro-rated to 30 Jun → 8
    const p = await previewSeparation(w.hr, { employeeId: e.id, type: "RESIGNATION", noticeDate: D("2026-05-01"), lastWorkingDate: D("2026-06-30") });
    expect(p.leaveEncashDays).toBe(8);
    expect(p.leaveEncashAmount).toBe(800);
  });

  it("validates dates", async () => {
    const e = await w.emp();
    await expect(previewSeparation(w.hr, { employeeId: e.id, type: "RESIGNATION", noticeDate: D("2026-09-10"), lastWorkingDate: D("2026-09-01") })).rejects.toThrow(/before the notice/);
  });
});

describe("Separation workflow", () => {
  it("employees may resign themselves but not terminate", async () => {
    const e = await w.emp({}, { login: "EMPLOYEE" });
    await expect(createSeparation(e.ctx!, { employeeId: e.id, type: "TERMINATION", noticeDate: D("2026-09-01"), lastWorkingDate: D("2026-10-30") })).rejects.toThrow(/permission/);
    const s = await createSeparation(e.ctx!, { employeeId: e.id, type: "RESIGNATION", noticeDate: D("2026-09-01"), lastWorkingDate: D("2026-10-30") });
    expect(s.status).toBe("PENDING");
    await expect(createSeparation(w.hr, { employeeId: e.id, type: "RESIGNATION", noticeDate: D("2026-09-01"), lastWorkingDate: D("2026-10-30") })).rejects.toThrow(/already an open/);
  });

  it("approval sets NOTICE status and creates the offboarding checklist", async () => {
    const e = await w.emp();
    const s = await createSeparation(w.hr, { employeeId: e.id, type: "RESIGNATION", noticeDate: D("2026-08-01"), lastWorkingDate: D("2026-09-30") });
    await approveSeparation(w.hr, s.id);
    const emp = await prisma.employee.findUniqueOrThrow({ where: { id: e.id } });
    expect(emp.status).toBe("NOTICE");
    expect(emp.lastWorkingDate?.toISOString().slice(0, 10)).toBe("2026-09-30");
    const cl = await prisma.checklist.findFirst({ where: { employeeId: e.id, type: "OFFBOARDING" }, include: { tasks: true } });
    expect(cl?.tasks.some((t) => /CP22A/.test(t.title))).toBe(true);
  });

  it("completion requires last day passed, assets returned and CP22A submitted; then deactivates login", async () => {
    const e = await w.emp({}, { login: "EMPLOYEE" });
    const asset = await prisma.asset.create({ data: { tenantId: w.tenantId, tag: `T-${e.id.slice(-4)}`, name: "Laptop", category: "LAPTOP", cost: 4000 } });
    await assignAsset(w.hr, asset.id, e.id);
    const s = await createSeparation(w.hr, { employeeId: e.id, type: "RESIGNATION", noticeDate: D("2026-07-01"), lastWorkingDate: D("2026-08-31") });
    await expect(completeSeparation(w.hr, s.id, { today: D("2026-09-01") })).rejects.toThrow(/Approve/);
    await approveSeparation(w.hr, s.id);
    await expect(completeSeparation(w.hr, s.id, { today: D("2026-08-15") })).rejects.toThrow(/after the last working day/);
    await expect(completeSeparation(w.hr, s.id, { today: D("2026-09-01") })).rejects.toThrow(/asset/);
    await returnAsset(w.hr, asset.id, "GOOD");
    await expect(completeSeparation(w.hr, s.id, { today: D("2026-09-01") })).rejects.toThrow(/CP22A/);
    await markCp22a(w.hr, s.id);
    await completeSeparation(w.hr, s.id, { today: D("2026-09-01"), exitInterview: "Great place", rehireEligible: true });
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("RESIGNED");
    expect((await prisma.user.findUniqueOrThrow({ where: { employeeId: e.id } })).active).toBe(false);
    expect(await prisma.employmentHistory.count({ where: { employeeId: e.id, type: "SEPARATED" } })).toBe(1);
  });

  it("retrenchment completes as TERMINATED, retirement as RETIRED", async () => {
    for (const [type, status] of [["RETRENCHMENT", "TERMINATED"], ["RETIREMENT", "RETIRED"]] as const) {
      const e = await w.emp();
      const s = await createSeparation(w.hr, { employeeId: e.id, type, noticeDate: D("2026-06-01"), lastWorkingDate: D("2026-08-31") });
      await approveSeparation(w.hr, s.id);
      await markCp22a(w.hr, s.id);
      await completeSeparation(w.hr, s.id, { today: D("2026-09-01") });
      expect((await prisma.employee.findUniqueOrThrow({ where: { id: e.id } })).status).toBe(status);
    }
  });

  it("withdrawal restores the previous status", async () => {
    const e = await w.emp();
    const s = await createSeparation(w.hr, { employeeId: e.id, type: "RESIGNATION", noticeDate: D("2026-09-01"), lastWorkingDate: D("2026-10-30") });
    await approveSeparation(w.hr, s.id);
    await withdrawSeparation(w.hr, s.id);
    const emp = await prisma.employee.findUniqueOrThrow({ where: { id: e.id } });
    expect(emp.status).toBe("ACTIVE");
    expect(emp.lastWorkingDate).toBeNull();
  });
});

describe("Checklists", () => {
  it("tracks progress; employees may tick only their own EMPLOYEE tasks", async () => {
    const e = await w.emp({}, { login: "EMPLOYEE" });
    const cl = await prisma.checklist.findFirstOrThrow({ where: { employeeId: e.id, type: "ONBOARDING" }, include: { tasks: true } });
    const mine = cl.tasks.find((t) => t.owner === "EMPLOYEE")!;
    const hrTask = cl.tasks.find((t) => t.owner === "HR")!;
    await toggleTask(e.ctx!, mine.id, true);
    await expect(toggleTask(e.ctx!, hrTask.id, true)).rejects.toThrow(/permission/);
    const after = await prisma.checklistTask.findMany({ where: { checklistId: cl.id } });
    expect(checklistProgress(after)).toBe(Math.round((1 / after.length) * 100));
  });

  it("HR can add tasks; titles are required", async () => {
    const cl = await prisma.checklist.findFirstOrThrow({ where: { employeeId: w.employeeId } });
    await expect(addTask(w.hr, cl.id, " ", "HR", null)).rejects.toThrow(/title/);
    const t = await addTask(w.hr, cl.id, "Order business cards", "HR", D("2026-10-01"));
    expect(t.sortOrder).toBeGreaterThan(0);
  });
});
