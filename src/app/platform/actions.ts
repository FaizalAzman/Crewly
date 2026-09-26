"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/server/context";
import { extendTrial, reactivateWorkspace, setWorkspacePlan, suspendWorkspace, type PlatformActor } from "@/server/services/platform.service";
import type { PlanKey } from "@/server/services/subscription.service";
import { DomainError, type ActionState } from "@/server/types";
import { dateField, numField, str } from "@/lib/utils";

async function actor(): Promise<PlatformActor> {
  const u = await getSessionUser();
  if (!u?.platformAdmin) throw new DomainError("Operators only.");
  return { userId: u.id, name: u.name, platformAdmin: true };
}

async function run(fn: (a: PlatformActor) => Promise<string>): Promise<ActionState> {
  try {
    const msg = await fn(await actor());
    revalidatePath("/platform", "layout");
    return { ok: true, message: msg };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function extendTrialAction(_: ActionState, fd: FormData) {
  return run(async (a) => `Trial extended to ${(await extendTrial(a, str(fd, "tenantId"), numField(fd, "days", 14))).toISOString().slice(0, 10)}`);
}

export async function suspendAction(_: ActionState, fd: FormData) {
  return run(async (a) => {
    await suspendWorkspace(a, str(fd, "tenantId"), str(fd, "reason"));
    return "Workspace suspended";
  });
}

export async function reactivateAction(_: ActionState, fd: FormData) {
  return run(async (a) => `Reactivated (${(await reactivateWorkspace(a, str(fd, "tenantId"))).toLowerCase()})`);
}

export async function setPlanAction(_: ActionState, fd: FormData) {
  return run(async (a) => {
    await setWorkspacePlan(a, str(fd, "tenantId"), str(fd, "plan") as PlanKey, dateField(fd, "activeUntil"));
    return "Plan updated";
  });
}
