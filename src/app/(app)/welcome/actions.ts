"use server";

import { redirect } from "next/navigation";
import { act } from "@/server/action";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { completeOnboarding, quickAddDepartments } from "@/server/services/onboarding.service";
import { updateWorkspace } from "@/server/services/settings.service";
import { createEmployee } from "@/server/services/employee.service";
import { DomainError, type ActionState } from "@/server/types";
import { dateField, numField, optStr, str } from "@/lib/utils";

const P = ["/welcome", "/dashboard", "/org"];

export async function companyStepAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("settings.manage");
  return act(async () => {
    const company = await prisma.company.findFirst({ where: { tenantId: ctx.tenantId, isDefault: true } });
    if (!company) throw new DomainError("No default company found.");
    const need = ["regNo", "epfNo", "socsoNo", "taxNo"].filter((k) => !str(fd, k));
    if (need.length) throw new DomainError("Fill in all four statutory numbers (you can update them later in Organization).");
    await prisma.company.update({
      where: { id: company.id },
      data: { name: str(fd, "name") || company.name, regNo: str(fd, "regNo"), epfNo: str(fd, "epfNo"), socsoNo: str(fd, "socsoNo"), taxNo: str(fd, "taxNo"), hrdfNo: optStr(fd, "hrdfNo"), address: optStr(fd, "address"), phone: optStr(fd, "phone") },
    });
    const t = await prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } });
    await updateWorkspace(ctx, {
      name: t.name,
      workDaysPerWeek: numField(fd, "workDaysPerWeek", t.workDaysPerWeek),
      restDay: numField(fd, "restDay", t.restDay),
      offDay: str(fd, "offDay") === "" ? null : numField(fd, "offDay"),
      payrollCutoff: t.payrollCutoff,
      payDay: numField(fd, "payDay", t.payDay),
      unpaidLeaveBasis: t.unpaidLeaveBasis,
      mileageRate: t.mileageRate,
      lateGraceMinutes: t.lateGraceMinutes,
    });
    return "Company details saved ✅";
  }, P);
}

export async function structureStepAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("org.manage");
  return act(async () => {
    const added = await quickAddDepartments(ctx, str(fd, "departments"));
    const branchName = str(fd, "branchName");
    if (branchName) {
      const company = await prisma.company.findFirstOrThrow({ where: { tenantId: ctx.tenantId, isDefault: true } });
      await prisma.branch.create({ data: { tenantId: ctx.tenantId, companyId: company.id, name: branchName, state: str(fd, "branchState") || company.state } });
    }
    return `Added ${added} department(s)${branchName ? " and a branch" : ""}`;
  }, P);
}

export async function profileStepAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("employee.manage");
  return act(async () => {
    if (ctx.employeeId) throw new DomainError("You already have an employee profile.");
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
    const e = await createEmployee(
      ctx,
      {
        fullName: str(fd, "fullName") || user.name,
        email: user.email,
        icNo: optStr(fd, "icNo"),
        jobTitle: str(fd, "jobTitle") || "Founder",
        joinDate: dateField(fd, "joinDate") ?? new Date(),
        basicSalary: numField(fd, "basicSalary"),
        probationMonths: 0,
      },
      { skipOnboarding: true },
    );
    await prisma.user.update({ where: { id: ctx.userId }, data: { employeeId: e.id } });
    return "Your profile is set up. The Me page is now yours.";
  }, P);
}

export async function finishAction(_: ActionState, _fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("settings.manage");
  const res = await act(async () => {
    await completeOnboarding(ctx);
    return "All set! 🎉";
  }, P);
  if (res?.ok) redirect("/dashboard");
  return res;
}
