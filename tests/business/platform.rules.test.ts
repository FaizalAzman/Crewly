import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { authenticate, signup } from "@/server/services/auth.service";
import { changePlan, changeUserRole, setUserActive, updateWorkspace } from "@/server/services/settings.service";
import { countPendingApprovals, listPendingApprovals } from "@/server/services/approvals.service";
import { applyLeave, approveLeave } from "@/server/services/leave.service";
import { approvalScope } from "@/server/services/scope";
import { eaForm } from "@/server/services/tax.service";
import { D, leaveType, makeWorld, type World } from "./factory";

let w: World;
beforeAll(async () => {
  w = await makeWorld();
});

describe("Sign-up & authentication", () => {
  const email = () => `founder-${randomUUID().slice(0, 8)}@startup.my`;

  it("sign-up bootstraps a complete workspace", async () => {
    const { tenant, user } = await signup({ companyName: "Kopi Robotics Sdn Bhd", name: "Founder", email: email(), password: "supersecret", state: "SELANGOR", headcount: 15 });
    expect(user.role).toBe("OWNER");
    expect(tenant.slug).toMatch(/^kopi-robotics/);
    expect(tenant.trialEndsAt).not.toBeNull();
    const [leaveTypes, payItems, claimTypes, letters, policies, templates, grades, company] = await Promise.all([
      prisma.leaveType.count({ where: { tenantId: tenant.id } }),
      prisma.payItem.count({ where: { tenantId: tenant.id } }),
      prisma.claimType.count({ where: { tenantId: tenant.id } }),
      prisma.letterTemplate.count({ where: { tenantId: tenant.id } }),
      prisma.policy.count({ where: { tenantId: tenant.id } }),
      prisma.checklistTemplate.count({ where: { tenantId: tenant.id } }),
      prisma.jobGrade.count({ where: { tenantId: tenant.id } }),
      prisma.company.findFirst({ where: { tenantId: tenant.id, isDefault: true } }),
    ]);
    expect(leaveTypes).toBeGreaterThanOrEqual(11);
    expect(payItems).toBeGreaterThan(15);
    expect(claimTypes).toBeGreaterThan(5);
    expect(letters).toBeGreaterThanOrEqual(5);
    expect(policies).toBeGreaterThanOrEqual(3);
    expect(templates).toBe(2);
    expect(grades).toBe(6);
    expect(company?.state).toBe("SELANGOR");
    expect(await prisma.publicHoliday.count({ where: { tenantId: null, year: 2026 } })).toBeGreaterThan(15);
  });

  it("east-coast states get a Friday rest day", async () => {
    const { tenant } = await signup({ companyName: "Kelantan Batik Co", name: "Siti", email: email(), password: "supersecret", state: "KELANTAN" });
    expect(tenant.restDay).toBe(5);
  });

  it("rejects duplicate emails, weak passwords and bad emails", async () => {
    const e = email();
    await signup({ companyName: "One Sdn Bhd", name: "Aina", email: e, password: "supersecret" });
    await expect(signup({ companyName: "Two Sdn Bhd", name: "Badrul", email: e, password: "supersecret" })).rejects.toThrow(/already/);
    await expect(signup({ companyName: "Three", name: "Chong", email: email(), password: "short" })).rejects.toThrow();
    await expect(signup({ companyName: "Four", name: "Devi", email: "not-an-email", password: "supersecret" })).rejects.toThrow();
  });

  it("de-duplicates workspace slugs", async () => {
    const a = await signup({ companyName: "Same Name Sdn Bhd", name: "Aina", email: email(), password: "supersecret" });
    const b = await signup({ companyName: "Same Name Sdn Bhd", name: "Badrul", email: email(), password: "supersecret" });
    expect(a.tenant.slug).not.toBe(b.tenant.slug);
  });

  it("authenticates with the right password (case-insensitive email) and logs it", async () => {
    const e = email();
    const { tenant } = await signup({ companyName: "Login Co", name: "Lina", email: e, password: "correct-horse" });
    await expect(authenticate(e, "wrong-password")).rejects.toThrow(/don't match/);
    const u = await authenticate(e.toUpperCase(), "correct-horse");
    expect(u.lastLoginAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { tenantId: tenant.id, action: "LOGIN" } })).toBe(1);
  });

  it("disabled users can't log in", async () => {
    const e = email();
    const { user } = await signup({ companyName: "Disabled Co", name: "Xavier", email: e, password: "supersecret" });
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    await expect(authenticate(e, "supersecret")).rejects.toThrow();
  });
});

describe("Tenant isolation", () => {
  it("services never act on another tenant's records", async () => {
    const other = await makeWorld();
    const al = await leaveType(w.tenantId, "AL");
    const r = await applyLeave(w.hr, { employeeId: w.employeeId, leaveTypeId: al.id, startDate: D("2026-12-07"), endDate: D("2026-12-07") }, { onBehalf: true });
    await expect(approveLeave(other.hr, r.id)).rejects.toThrow(/not found/);
    await expect(applyLeave(other.hr, { employeeId: w.employeeId, leaveTypeId: al.id, startDate: D("2026-12-08"), endDate: D("2026-12-08") }, { onBehalf: true })).rejects.toThrow(/not found/);
    await expect(eaForm(other.hr, w.employeeId, 2026)).rejects.toThrow(/not found/);
  });

  it("approval inboxes only list the tenant's own requests", async () => {
    const other = await makeWorld();
    const p = await listPendingApprovals(other.hr);
    const all = [...p.leave, ...p.claims, ...p.overtime, ...p.loans, ...p.compensation];
    expect(all.every((x) => x.tenantId === other.tenantId)).toBe(true);
  });
});

describe("Approval scope", () => {
  it("HR sees everyone; managers see their (indirect) reports; employees see nobody", async () => {
    expect(await approvalScope(w.hr)).toBeNull();
    const deep = await w.emp({ managerId: w.employeeId });
    const scope = await approvalScope(w.manager);
    expect(scope).toEqual(expect.arrayContaining([w.employeeId, deep.id]));
    expect(await approvalScope(w.employee)).toEqual([deep.id]);
  });

  it("pending counts exclude the approver's own requests", async () => {
    const al = await leaveType(w.tenantId, "AL");
    const hrEmp = await w.emp();
    const hrCtx = await w.ctxFor(hrEmp.id, "HR_ADMIN");
    const before = await countPendingApprovals(hrCtx);
    await applyLeave(w.hr, { employeeId: hrEmp.id, leaveTypeId: al.id, startDate: D("2026-12-14"), endDate: D("2026-12-14") }, { onBehalf: true });
    expect(await countPendingApprovals(hrCtx)).toBe(before);
    expect(await countPendingApprovals(w.owner)).toBeGreaterThan(0);
  });
});

describe("Workspace settings & users", () => {
  const settings = { name: "Test", workDaysPerWeek: 5, restDay: 0, offDay: 6 as number | null, payrollCutoff: 25, payDay: 28, unpaidLeaveBasis: "WORKING_DAYS", mileageRate: 0.6, lateGraceMinutes: 10 };

  it("validates workspace policy values", async () => {
    await expect(updateWorkspace(w.owner, { ...settings, workDaysPerWeek: 4 })).rejects.toThrow(/5, 5.5 or 6/);
    await expect(updateWorkspace(w.owner, { ...settings, offDay: 0 })).rejects.toThrow(/differ/);
    await expect(updateWorkspace(w.owner, { ...settings, workDaysPerWeek: 6 })).rejects.toThrow(/6-day/);
    await expect(updateWorkspace(w.owner, { ...settings, payDay: 30 })).rejects.toThrow(/EA s.19/);
    await expect(updateWorkspace(w.owner, { ...settings, lateGraceMinutes: 90 })).rejects.toThrow(/Grace/);
    await updateWorkspace(w.owner, { ...settings, workDaysPerWeek: 5.5 });
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: w.tenantId } })).workDaysPerWeek).toBe(5.5);
    await updateWorkspace(w.owner, settings);
  });

  it("only settings managers can change settings", async () => {
    await expect(updateWorkspace(w.payroll, settings)).rejects.toThrow(/permission/);
  });

  it("role changes: not yourself, owner-only for owner role, keep ≥ 1 owner", async () => {
    await expect(changeUserRole(w.hr, w.hr.userId, "OWNER")).rejects.toThrow(/own role/);
    await expect(changeUserRole(w.hr, w.payroll.userId, "OWNER")).rejects.toThrow(/owner/);
    await expect(changeUserRole(w.owner, w.payroll.userId, "SUPERHERO")).rejects.toThrow(/Unknown role/);
    await changeUserRole(w.owner, w.payroll.userId, "HR_ADMIN");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: w.payroll.userId } })).role).toBe("HR_ADMIN");
    await changeUserRole(w.owner, w.payroll.userId, "PAYROLL");
    const solo = await makeWorld();
    const second = await solo.ctxFor((await solo.emp()).id, "OWNER");
    await changeUserRole(solo.owner, second.userId, "HR_ADMIN"); // fine — first owner remains
    await expect(changeUserRole(second, solo.owner.userId, "EMPLOYEE")).rejects.toThrow(/owner/);
  });

  it("can't deactivate yourself or the last owner", async () => {
    await expect(setUserActive(w.hr, w.hr.userId, false)).rejects.toThrow(/yourself/);
    await expect(setUserActive(w.hr, w.owner.userId, false)).rejects.toThrow(/last owner/);
    await setUserActive(w.hr, w.employee.userId, false);
    await setUserActive(w.hr, w.employee.userId, true);
  });

  it("plan changes respect seat and entity limits; only owners manage billing", async () => {
    await expect(changePlan(w.hr, "GROWTH", "MONTHLY")).rejects.toThrow(/permission/);
    await prisma.company.create({ data: { tenantId: w.tenantId, name: "Second entity" } });
    await expect(changePlan(w.owner, "GROWTH", "MONTHLY")).rejects.toThrow(/Enterprise/);
    await changePlan(w.owner, "ENTERPRISE", "YEARLY");
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: w.tenantId } })).billingCycle).toBe("YEARLY");
  });
});
