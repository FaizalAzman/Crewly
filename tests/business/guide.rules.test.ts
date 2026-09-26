/** The role-based "Getting started" checklist and the invitation email's description of the role. */
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { dismissGuide, gettingStarted } from "@/server/services/guide.service";
import { saveTaxDeclaration } from "@/server/services/tax.service";
import { clockIn } from "@/server/services/time.service";
import { inviteAbilities } from "@/server/services/auth.service";
import { makeWorld, type World } from "./factory";

const keys = async (w: Parameters<typeof gettingStarted>[0]) => (await gettingStarted(w)).steps.map((s) => s.key);

describe("Getting started checklist", () => {
  let w: World;
  beforeAll(async () => {
    w = await makeWorld();
  });

  it("shows each role only the steps it can act on", async () => {
    expect(await keys(w.employee)).toEqual(["profile", "tp1", "clock", "policies"]);
    expect(await keys(w.manager)).toEqual(["profile", "tp1", "clock", "policies", "approvals"]);
    expect(await keys(w.payroll)).toEqual(expect.arrayContaining(["employer-numbers", "payroll", "approvals"]));
    expect(await keys(w.hr)).toEqual(expect.arrayContaining(["records", "logins", "employer-numbers"]));
    expect(await keys(w.hr)).not.toContain("profile"); // no employee profile linked
  });

  it("ticks steps off from real data, not clicks", async () => {
    const step = async (key: string) => (await gettingStarted(w.employee)).steps.find((s) => s.key === key)!.done;
    expect(await step("tp1")).toBe(false);
    await saveTaxDeclaration(w.employee, w.employeeId, new Date().getUTCFullYear(), { lifestyle: 1000 });
    expect(await step("tp1")).toBe(true);
    expect(await step("clock")).toBe(false);
    await clockIn(w.employee, {});
    expect(await step("clock")).toBe(true);
    // Payroll: employer numbers are set by the test world, but no run has been calculated yet.
    const payroll = await gettingStarted(w.payroll);
    expect(payroll.steps.find((s) => s.key === "employer-numbers")!.done).toBe(true);
    expect(payroll.steps.find((s) => s.key === "payroll")!.done).toBe(false);
  });

  it("can be hidden, per person", async () => {
    expect((await gettingStarted(w.manager)).visible).toBe(true);
    await dismissGuide(w.manager);
    expect((await gettingStarted(w.manager)).visible).toBe(false);
    expect((await gettingStarted(w.employee)).visible).toBe(true);
  });
});

describe("Invitation email", () => {
  it("describes what the role can do", async () => {
    const w = await makeWorld();
    const [manager, employee, hr] = await Promise.all(
      [w.manager, w.employee, w.hr].map((c) => prisma.user.findUniqueOrThrow({ where: { id: c.userId }, include: { customRole: true } })),
    );
    expect(inviteAbilities(employee)).toEqual(["See your payslips and Form EA, apply for leave, submit claims and clock in"]);
    expect(inviteAbilities(manager)).toContain("Approve leave, claims and overtime for your team");
    expect(inviteAbilities(hr)).toEqual(expect.arrayContaining(["Manage employee records, letters, onboarding and offboarding", "Run payroll and prepare the KWSP, PERKESO and LHDN files"]));
  });
});
