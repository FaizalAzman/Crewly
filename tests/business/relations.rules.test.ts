import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { addDays, todayMY } from "@/lib/utils";
import {
  assignAsset,
  closeCase,
  decideCase,
  fileGrievance,
  issueShowCause,
  openCase,
  recordReply,
  returnAsset,
  scheduleInquiry,
  suspendPendingInquiry,
  updateGrievance,
  upsertPermit,
} from "@/server/services/relations.service";
import { D, makeWorld, type World } from "./factory";

let w: World;
beforeAll(async () => {
  w = await makeWorld();
});

const open = (employeeId = w.employeeId) => openCase(w.hr, { employeeId, category: "MISCONDUCT", severity: "MAJOR", incidentDate: D("2026-08-01"), description: "Insubordination" });

describe("Disciplinary due process", () => {
  it("numbers cases sequentially and rejects future incidents", async () => {
    const a = await open();
    const b = await open();
    expect(a.caseNo).toMatch(/^DC-\d{4}-\d{3}$/);
    expect(Number(b.caseNo.slice(-3))).toBe(Number(a.caseNo.slice(-3)) + 1);
    await expect(openCase(w.hr, { employeeId: w.employeeId, category: "OTHER", severity: "MINOR", incidentDate: addDays(todayMY(), 5), description: "x" })).rejects.toThrow(/future/);
  });

  it("no punitive outcome without a show-cause (right to be heard)", async () => {
    const c = await open();
    await expect(decideCase(w.hr, c.id, "WRITTEN_WARNING", "Because")).rejects.toThrow(/show-cause/);
    const ok = await decideCase(w.hr, c.id, "NO_ACTION", "Insufficient evidence");
    expect(ok.stage).toBe("DECIDED");
  });

  it("show-cause requires ≥ 48 hours to reply", async () => {
    const c = await open();
    await expect(issueShowCause(w.hr, c.id, 1)).rejects.toThrow(/48 hours/);
    const s = await issueShowCause(w.hr, c.id, 3);
    expect(s.stage).toBe("SHOW_CAUSE");
    expect(s.replyDueDate).not.toBeNull();
  });

  it("dismissal requires a domestic inquiry (EA s.14(1))", async () => {
    const c = await open();
    await issueShowCause(w.hr, c.id, 3);
    await recordReply(w.hr, c.id, "I apologise");
    await expect(decideCase(w.hr, c.id, "DISMISSAL", "Serious misconduct")).rejects.toThrow(/domestic inquiry/);
    await expect(scheduleInquiry(w.hr, c.id, addDays(todayMY(), 5), "")).rejects.toThrow(/panel/);
    await scheduleInquiry(w.hr, c.id, addDays(todayMY(), 5), "Independent chair + 2");
    const d = await decideCase(w.hr, c.id, "DISMISSAL", "Charges proven at DI");
    expect(d.outcome).toBe("DISMISSAL");
    await expect(decideCase(w.hr, c.id, "NO_ACTION", "changed mind")).rejects.toThrow(/already decided/);
    expect((await closeCase(w.hr, c.id)).stage).toBe("CLOSED");
  });

  it("inquiry can't be scheduled before a show-cause, nor too soon after it", async () => {
    const c = await open();
    await expect(scheduleInquiry(w.hr, c.id, addDays(todayMY(), 5), "Panel")).rejects.toThrow(/show-cause/);
    await issueShowCause(w.hr, c.id, 2);
    await expect(scheduleInquiry(w.hr, c.id, addDays(todayMY(), 1), "Panel")).rejects.toThrow(/2 days/);
  });

  it("suspension pending inquiry is capped at 14 days (EA s.14(2))", async () => {
    const c = await open();
    await expect(suspendPendingInquiry(w.hr, c.id, 15)).rejects.toThrow(/14 days/);
    expect((await suspendPendingInquiry(w.hr, c.id, 14)).suspended).toBe(true);
  });

  it("a decision needs recorded reasons; only decided cases close", async () => {
    const c = await open();
    await expect(decideCase(w.hr, c.id, "NO_ACTION", " ")).rejects.toThrow(/reasons/);
    await expect(closeCase(w.hr, c.id)).rejects.toThrow(/decided/);
  });

  it("payroll & managers can't access ER cases", async () => {
    await expect(openCase(w.payroll, { employeeId: w.employeeId, category: "OTHER", severity: "MINOR", incidentDate: D("2026-08-01"), description: "x" })).rejects.toThrow(/permission/);
    await expect(openCase(w.manager, { employeeId: w.employeeId, category: "OTHER", severity: "MINOR", incidentDate: D("2026-08-01"), description: "x" })).rejects.toThrow(/permission/);
  });
});

describe("Grievances & sexual harassment (EA Part XVA)", () => {
  it("sexual harassment complaints can't be anonymous and get a 30-day inquiry deadline", async () => {
    await expect(fileGrievance(w.employee, { employeeId: null, anonymous: true, category: "SEXUAL_HARASSMENT", subject: "x", description: "y" })).rejects.toThrow(/anonymous/);
    const g = await fileGrievance(w.employee, { employeeId: w.employeeId, anonymous: false, category: "SEXUAL_HARASSMENT", subject: "Inappropriate remarks", description: "Details" });
    expect(g.priority).toBe("HIGH");
    expect(Math.round((g.inquiryDueDate!.getTime() - todayMY().getTime()) / 86400000)).toBe(30);
  });

  it("anonymous grievances store no employee link", async () => {
    const g = await fileGrievance(w.employee, { employeeId: w.employeeId, anonymous: true, category: "WORKPLACE", subject: "Noise", description: "Too loud" });
    expect(g.employeeId).toBeNull();
  });

  it("employees can't file on behalf of others", async () => {
    await expect(fileGrievance(w.employee, { employeeId: w.managerEmployeeId, anonymous: false, category: "PAY", subject: "x", description: "y" })).rejects.toThrow(/permission/);
  });

  it("resolving requires a resolution; SH complaints can't jump from OPEN to CLOSED", async () => {
    const g = await fileGrievance(w.employee, { employeeId: w.employeeId, anonymous: false, category: "SEXUAL_HARASSMENT", subject: "x", description: "y" });
    await expect(updateGrievance(w.hr, g.id, "CLOSED", "No issue")).rejects.toThrow(/investigated/);
    await updateGrievance(w.hr, g.id, "INVESTIGATING");
    await expect(updateGrievance(w.hr, g.id, "RESOLVED", "")).rejects.toThrow(/resolution/);
    const r = await updateGrievance(w.hr, g.id, "RESOLVED", "Inquiry completed; action taken");
    expect(r.resolvedAt).not.toBeNull();
  });
});

describe("Foreign workforce permits", () => {
  const permit = (employeeId: string, expiry: Date, extra: Record<string, unknown> = {}) =>
    upsertPermit(w.hr, { employeeId, permitType: "PLKS", permitNo: "P-1", sector: "MANUFACTURING", sourceCountry: "Nepal", issueDate: D("2025-01-01"), expiryDate: expiry, levyAmount: 1850, fomemaStatus: "FIT", ...extra });

  it("only non-citizens can hold work permits", async () => {
    await expect(permit(w.employeeId, D("2027-01-01"))).rejects.toThrow(/non-citizen/);
  });

  it("status reflects expiry: ACTIVE / RENEWAL (≤ 90 days) / EXPIRED", async () => {
    const f = await w.emp({ citizenship: "FOREIGNER", passportNo: "NP1", icNo: null, basicSalary: 1800 });
    expect((await permit(f.id, addDays(todayMY(), 200))).status).toBe("ACTIVE");
    expect((await permit(f.id, addDays(todayMY(), 45))).status).toBe("RENEWAL");
    expect((await permit(f.id, addDays(todayMY(), -1))).status).toBe("EXPIRED");
  });

  it("FOMEMA-unfit workers can't hold a PLKS; expiry must follow issue", async () => {
    const f = await w.emp({ citizenship: "FOREIGNER", passportNo: "NP2", icNo: null, basicSalary: 1800 });
    await expect(permit(f.id, D("2027-01-01"), { fomemaStatus: "UNFIT" })).rejects.toThrow(/UNFIT/);
    await expect(permit(f.id, D("2024-01-01"))).rejects.toThrow(/after issue/);
  });
});

describe("Assets", () => {
  it("assign → return; can't double-assign or assign to leavers", async () => {
    const a = await prisma.asset.create({ data: { tenantId: w.tenantId, tag: "A-1", name: "Laptop", category: "LAPTOP", cost: 5000 } });
    await assignAsset(w.hr, a.id, w.employeeId);
    await expect(assignAsset(w.hr, a.id, w.managerEmployeeId)).rejects.toThrow(/assigned/);
    const back = await returnAsset(w.hr, a.id, "POOR", "Cracked screen");
    expect(back).toMatchObject({ status: "REPAIR", assignedToId: null });
    const leaver = await w.emp();
    await prisma.employee.update({ where: { id: leaver.id }, data: { status: "RESIGNED" } });
    const b = await prisma.asset.create({ data: { tenantId: w.tenantId, tag: "A-2", name: "Phone", category: "PHONE", cost: 3000 } });
    await expect(assignAsset(w.hr, b.id, leaver.id)).rejects.toThrow(/former employee/);
  });
});
