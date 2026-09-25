import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { confirmEmployee, createEmployee, extendProbation, updateEmployee, addChild, createLoginForEmployee } from "@/server/services/employee.service";
import { D, makeWorld, nric, type World } from "./factory";

let w: World;
beforeAll(async () => {
  w = await makeWorld();
});

const base = () => ({ fullName: "Ali bin Abu", email: `ali-${Math.random().toString(36).slice(2, 8)}@test.my`, jobTitle: "Clerk", joinDate: D("2026-01-05"), basicSalary: 2500, probationMonths: 3 });

describe("Employee creation rules", () => {
  it("requires an NRIC for citizens", async () => {
    await expect(createEmployee(w.hr, { ...base(), icNo: null })).rejects.toThrow(/NRIC/);
  });

  it("rejects malformed NRIC", async () => {
    await expect(createEmployee(w.hr, { ...base(), icNo: "991340-14-1234" })).rejects.toThrow(/valid/);
  });

  it("derives date of birth and gender from the NRIC", async () => {
    const e = await createEmployee(w.hr, { ...base(), icNo: "950607-10-5432" });
    expect(e.dateOfBirth?.toISOString().slice(0, 10)).toBe("1995-06-07");
    expect(e.gender).toBe("FEMALE");
    expect(e.icNo).toBe("950607-10-5432");
  });

  it("requires a passport for foreign employees and disables HRD levy", async () => {
    await expect(createEmployee(w.hr, { ...base(), citizenship: "FOREIGNER", icNo: null, passportNo: null })).rejects.toThrow(/Passport/);
    const f = await createEmployee(w.hr, { ...base(), citizenship: "FOREIGNER", passportNo: "BD1234567", icNo: null, hrdfApplicable: true });
    expect(f.hrdfApplicable).toBe(false);
  });

  it("enforces the RM1,700 minimum wage for full-time staff", async () => {
    await expect(createEmployee(w.hr, { ...base(), icNo: nric(), basicSalary: 1699.99 })).rejects.toThrow(/minimum wage/);
  });

  it("allows interns and part-timers below the minimum wage", async () => {
    const intern = await createEmployee(w.hr, { ...base(), icNo: nric(), basicSalary: 1200, employmentType: "INTERN" });
    expect(intern.basicSalary).toBe(1200);
  });

  it("requires a contract end date after the join date for contract staff", async () => {
    await expect(createEmployee(w.hr, { ...base(), icNo: nric(), employmentType: "CONTRACT" })).rejects.toThrow(/contract end/i);
    await expect(createEmployee(w.hr, { ...base(), icNo: nric(), employmentType: "CONTRACT", contractEndDate: D("2025-12-01") })).rejects.toThrow(/after the join date/);
  });

  it("blocks duplicate active emails and NRICs", async () => {
    const ic = nric();
    const first = await createEmployee(w.hr, { ...base(), icNo: ic });
    await expect(createEmployee(w.hr, { ...base(), email: first.email, icNo: nric() })).rejects.toThrow(/email/);
    await expect(createEmployee(w.hr, { ...base(), icNo: ic })).rejects.toThrow(/NRIC/);
  });

  it("auto-generates sequential employee numbers", async () => {
    const a = await createEmployee(w.hr, { ...base(), icNo: nric() });
    const b = await createEmployee(w.hr, { ...base(), icNo: nric() });
    expect(a.employeeNo).toMatch(/^EMP\d{4}$/);
    expect(Number(b.employeeNo.slice(3))).toBeGreaterThan(Number(a.employeeNo.slice(3)));
  });

  it("starts permanent staff with probation on PROBATION and sets the confirmation date", async () => {
    const e = await createEmployee(w.hr, { ...base(), icNo: nric(), joinDate: D("2026-01-31"), probationMonths: 1 });
    expect(e.status).toBe("PROBATION");
    expect(e.confirmationDate?.toISOString().slice(0, 10)).toBe("2026-02-28"); // clamped month end
  });

  it("creates leave balances, a JOINED history entry and an onboarding checklist", async () => {
    const e = await createEmployee(w.hr, { ...base(), icNo: nric() });
    const [balances, history, checklist] = await Promise.all([
      prisma.leaveBalance.count({ where: { employeeId: e.id } }),
      prisma.employmentHistory.findMany({ where: { employeeId: e.id } }),
      prisma.checklist.findFirst({ where: { employeeId: e.id, type: "ONBOARDING" }, include: { tasks: true } }),
    ]);
    expect(balances).toBeGreaterThan(5);
    expect(history.map((h) => h.type)).toContain("JOINED");
    expect(checklist?.tasks.some((t) => /CP22/.test(t.title))).toBe(true);
    expect(checklist?.tasks.some((t) => /KWSP/.test(t.title))).toBe(true);
  });

  it("can create a self-service login at the same time", async () => {
    const e = await createEmployee(w.hr, { ...base(), icNo: nric() }, { createLogin: true, loginPassword: "Welcome2026!" });
    const u = await prisma.user.findUnique({ where: { employeeId: e.id } });
    expect(u?.role).toBe("EMPLOYEE");
  });

  it("denies employees and managers from creating employees", async () => {
    await expect(createEmployee(w.employee, { ...base(), icNo: nric() })).rejects.toThrow(/permission/);
    await expect(createEmployee(w.manager, { ...base(), icNo: nric() })).rejects.toThrow(/permission/);
  });

  it("writes an audit log entry", async () => {
    const e = await createEmployee(w.hr, { ...base(), icNo: nric() });
    expect(await prisma.auditLog.count({ where: { tenantId: w.tenantId, entityId: e.id, action: "CREATE" } })).toBe(1);
  });
});

describe("Employee updates", () => {
  it("records salary and title changes in the job history", async () => {
    const { id } = await w.emp();
    await updateEmployee(w.hr, id, { basicSalary: 6000, jobTitle: "Senior Executive" });
    const h = await prisma.employmentHistory.findFirst({ where: { employeeId: id, type: "REDESIGNATION" } });
    expect(h?.title).toMatch(/5000 → RM6000/);
    expect(h?.title).toMatch(/Senior Executive/);
  });

  it("prevents an employee from reporting to themselves", async () => {
    const { id } = await w.emp();
    await expect(updateEmployee(w.hr, id, { managerId: id })).rejects.toThrow(/themselves/);
  });

  it("prevents reporting loops", async () => {
    const a = await w.emp();
    const b = await w.emp({ managerId: a.id });
    await expect(updateEmployee(w.hr, a.id, { managerId: b.id })).rejects.toThrow(/loop/);
  });

  it("re-validates minimum wage on update", async () => {
    const { id } = await w.emp();
    await expect(updateEmployee(w.hr, id, { basicSalary: 1500 })).rejects.toThrow(/minimum wage/);
  });

  it("clears spouse flags when not married", async () => {
    const { id } = await w.emp({ maritalStatus: "MARRIED", spouseWorking: true });
    const e = await updateEmployee(w.hr, id, { maritalStatus: "DIVORCED" });
    expect(e.spouseWorking).toBe(false);
  });

  it("scopes updates to the tenant", async () => {
    const other = await makeWorld();
    await expect(updateEmployee(other.hr, w.employeeId, { jobTitle: "Hacker" })).rejects.toThrow(/not found/);
  });
});

describe("Probation", () => {
  it("confirms an employee on probation", async () => {
    const e = await createEmployee(w.hr, { ...base(), icNo: nric() });
    const c = await confirmEmployee(w.hr, e.id, D("2026-04-05"));
    expect(c.status).toBe("ACTIVE");
    expect(await prisma.employmentHistory.count({ where: { employeeId: e.id, type: "CONFIRMED" } })).toBe(1);
  });

  it("rejects confirming someone not on probation", async () => {
    await expect(confirmEmployee(w.hr, w.employeeId)).rejects.toThrow(/probation/);
  });

  it("extends probation by 1–6 months only", async () => {
    const e = await createEmployee(w.hr, { ...base(), icNo: nric(), joinDate: D("2026-01-05"), probationMonths: 3 });
    await expect(extendProbation(w.hr, e.id, 7)).rejects.toThrow(/1 – 6/);
    const x = await extendProbation(w.hr, e.id, 2);
    expect(x.confirmationDate?.toISOString().slice(0, 10)).toBe("2026-06-05");
    expect(x.probationMonths).toBe(5);
  });
});

describe("Family & logins", () => {
  it("lets employees add their own children but not others'", async () => {
    await addChild(w.employee, w.employeeId, { name: "Kid", dateOfBirth: D("2020-01-01") });
    await expect(addChild(w.employee, w.managerEmployeeId, { name: "Kid", dateOfBirth: D("2020-01-01") })).rejects.toThrow(/permission/);
  });

  it("rejects future dates of birth", async () => {
    await expect(addChild(w.hr, w.employeeId, { name: "Future", dateOfBirth: D("2099-01-01") })).rejects.toThrow(/future/);
  });

  it("only owners can create owner logins; one login per employee", async () => {
    const { id } = await w.emp();
    await expect(createLoginForEmployee(w.hr, id, "OWNER", "Password123")).rejects.toThrow(/owner/);
    await createLoginForEmployee(w.owner, id, "MANAGER", "Password123");
    await expect(createLoginForEmployee(w.owner, id, "EMPLOYEE", "Password123")).rejects.toThrow(/already has a login/);
  });
});
