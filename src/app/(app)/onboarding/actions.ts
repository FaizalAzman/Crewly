"use server";

import { revalidatePath } from "next/cache";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { act } from "@/server/action";
import { addTask, createChecklistFromTemplate, toggleTask } from "@/server/services/lifecycle.service";
import { dateField, str } from "@/lib/utils";
import type { ActionState } from "@/server/types";

export async function toggleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("lifecycle.manage");
  return act(async () => {
    await toggleTask(ctx, str(fd, "taskId"), str(fd, "done") === "true");
    revalidatePath("/onboarding");
    revalidatePath("/offboarding");
    return str(fd, "done") === "true" ? "Done ✅" : "Reopened";
  });
}

export async function addTaskAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("lifecycle.manage");
  return act(async () => {
    await addTask(ctx, str(fd, "checklistId"), str(fd, "title"), str(fd, "owner") || "HR", dateField(fd, "dueDate"));
    revalidatePath("/onboarding");
    revalidatePath("/offboarding");
    return "Task added";
  });
}

export async function startChecklistAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("lifecycle.manage");
  return act(async () => {
    const emp = await prisma.employee.findFirst({ where: { id: str(fd, "employeeId"), tenantId: ctx.tenantId } });
    if (!emp) return "Employee not found";
    await createChecklistFromTemplate(ctx, emp.id, "ONBOARDING", emp.joinDate);
    revalidatePath("/onboarding");
    return "Checklist started";
  });
}
