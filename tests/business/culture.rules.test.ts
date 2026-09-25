import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { acknowledgePolicy, commentTicket, generateLetter, giveKudos, openTicket, respondSurvey, setTicketStatus } from "@/server/services/culture.service";
import { makeWorld, type World } from "./factory";

let w: World;
beforeAll(async () => {
  w = await makeWorld();
});

describe("Letters & policies", () => {
  it("merges employee and company fields into templates", async () => {
    const tpl = await prisma.letterTemplate.findFirstOrThrow({ where: { tenantId: w.tenantId, category: "OFFER" } });
    const l = await generateLetter(w.hr, tpl.id, w.employeeId);
    const emp = await prisma.employee.findUniqueOrThrow({ where: { id: w.employeeId } });
    expect(l.content).toContain(emp.fullName);
    expect(l.content).toContain("RM5,000.00");
    expect(l.content).not.toMatch(/\{\{/);
  });

  it("only HR can generate letters", async () => {
    const tpl = await prisma.letterTemplate.findFirstOrThrow({ where: { tenantId: w.tenantId } });
    await expect(generateLetter(w.employee, tpl.id, w.employeeId)).rejects.toThrow(/permission/);
  });

  it("policy acknowledgement is idempotent", async () => {
    const p = await prisma.policy.findFirstOrThrow({ where: { tenantId: w.tenantId } });
    await acknowledgePolicy(w.employee, p.id);
    await acknowledgePolicy(w.employee, p.id);
    expect(await prisma.policyAcknowledgement.count({ where: { policyId: p.id, employeeId: w.employeeId } })).toBe(1);
  });
});

describe("Kudos", () => {
  it("no self-kudos, a real message, and max 5 per 24 hours", async () => {
    await expect(giveKudos(w.employee, { toId: w.employeeId, value: "Teamwork", message: "I'm great" })).rejects.toThrow(/yourself/);
    await expect(giveKudos(w.employee, { toId: w.managerEmployeeId, value: "Teamwork", message: "ty" })).rejects.toThrow(/more/);
    for (let i = 0; i < 5; i++) await giveKudos(w.employee, { toId: w.managerEmployeeId, value: "Teamwork", message: `Thanks for the help #${i}` });
    await expect(giveKudos(w.employee, { toId: w.managerEmployeeId, value: "Teamwork", message: "One more thanks!" })).rejects.toThrow(/5 kudos/);
  });

  it("notifies the recipient", async () => {
    const e = await w.emp({}, { login: "EMPLOYEE" });
    await giveKudos(w.manager, { toId: e.id, value: "Ownership", message: "Brilliant launch!" });
    expect(await prisma.notification.count({ where: { userId: e.ctx!.userId } })).toBe(1);
  });
});

describe("Pulse surveys", () => {
  const questions = JSON.stringify([
    { id: "q1", text: "Recommend?", type: "NPS" },
    { id: "q2", text: "Tools?", type: "SCALE" },
    { id: "q3", text: "Ideas?", type: "TEXT" },
  ]);

  it("anonymous surveys store no employee id and prevent double responses", async () => {
    const s = await prisma.survey.create({ data: { tenantId: w.tenantId, title: "Pulse", questions, anonymous: true } });
    const r = await respondSurvey(w.employee, s.id, { q1: 9, q2: 4, q3: "More coffee" });
    expect(r.employeeId).toBeNull();
    await expect(respondSurvey(w.employee, s.id, { q1: 10, q2: 5, q3: "" })).rejects.toThrow(/already responded/);
  });

  it("validates answer ranges", async () => {
    const s = await prisma.survey.create({ data: { tenantId: w.tenantId, title: "Pulse 2", questions } });
    await expect(respondSurvey(w.manager, s.id, { q1: 11, q2: 3 })).rejects.toThrow(/0 – 10/);
    await expect(respondSurvey(w.manager, s.id, { q1: 5, q2: 0 })).rejects.toThrow(/1 – 5/);
  });

  it("closed or expired surveys reject responses", async () => {
    const s = await prisma.survey.create({ data: { tenantId: w.tenantId, title: "Old", questions, closesAt: new Date(Date.now() - 86400000) } });
    await expect(respondSurvey(w.employee, s.id, { q1: 8, q2: 4 })).rejects.toThrow(/closed/);
  });
});

describe("Helpdesk", () => {
  it("tickets get sequential refs; employees see only their own", async () => {
    const t = await openTicket(w.employee, { category: "PAYROLL", subject: "EA form", description: "Need my EA", priority: "MEDIUM" });
    expect(t.refNo).toMatch(/^HR-\d+$/);
    const other = await w.emp({}, { login: "EMPLOYEE" });
    await expect(commentTicket(other.ctx!, t.id, "hi", false)).rejects.toThrow(/not found/);
  });

  it("only HR can add internal notes; HR replies move the ticket in progress and notify", async () => {
    const t = await openTicket(w.employee, { category: "LEAVE", subject: "Balance", description: "Wrong?", priority: "LOW" });
    await expect(commentTicket(w.employee, t.id, "secret", true)).rejects.toThrow(/Only HR/);
    await commentTicket(w.hr, t.id, "Checking now", false);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("IN_PROGRESS");
    expect(await prisma.notification.count({ where: { userId: w.employee.userId, title: { contains: t.refNo } } })).toBe(1);
  });

  it("closed tickets accept no more comments; status changes need helpdesk rights", async () => {
    const t = await openTicket(w.employee, { category: "OTHER", subject: "x", description: "y", priority: "LOW" });
    await expect(setTicketStatus(w.employee, t.id, "CLOSED")).rejects.toThrow(/permission/);
    await setTicketStatus(w.hr, t.id, "CLOSED");
    await expect(commentTicket(w.employee, t.id, "hello?", false)).rejects.toThrow(/closed/);
  });
});
