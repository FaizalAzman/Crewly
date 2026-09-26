"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/action";
import { requireCtx } from "@/server/context";
import { changeOwnPassword, changePlan, changeUserRole, closeWorkspace, inviteUser, resetUserPassword, setUserActive, updateWorkspace } from "@/server/services/settings.service";
import { cancelSubscription, checkout, type PlanKey } from "@/server/services/subscription.service";
import { redirect } from "next/navigation";
import { deleteCustomRole, saveCustomRole } from "@/server/services/roles.service";
import { numField, optStr, str } from "@/lib/utils";
import { DomainError, type ActionState } from "@/server/types";

export async function workspaceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("settings.manage");
  return act(async () => {
    await updateWorkspace(ctx, {
      name: str(fd, "name"),
      workDaysPerWeek: numField(fd, "workDaysPerWeek", 5),
      restDay: numField(fd, "restDay"),
      offDay: str(fd, "offDay") === "" ? null : numField(fd, "offDay"),
      payrollCutoff: numField(fd, "payrollCutoff", 25),
      payDay: numField(fd, "payDay", 28),
      unpaidLeaveBasis: str(fd, "unpaidLeaveBasis"),
      mileageRate: numField(fd, "mileageRate", 0.6),
      lateGraceMinutes: numField(fd, "lateGraceMinutes", 10),
    });
    revalidatePath("/", "layout");
    return "Settings saved";
  });
}

export async function roleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("settings.manage");
  return act(async () => {
    await changeUserRole(ctx, str(fd, "userId"), str(fd, "role"));
    return "Role updated";
  }, ["/settings"]);
}

export async function activeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("settings.manage");
  return act(async () => {
    await setUserActive(ctx, str(fd, "userId"), str(fd, "active") === "true");
    return "User updated";
  }, ["/settings"]);
}

export async function inviteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("settings.manage");
  return act(async () => {
    const u = await inviteUser(ctx, { name: str(fd, "name"), email: str(fd, "email"), roleKey: str(fd, "role"), password: str(fd, "password") });
    return `${u.name} has been invited by email.${u.inviteLink ? ` (Dev: set-password link ${u.inviteLink})` : ""}`;
  }, ["/settings"]);
}

export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("settings.manage");
  return act(async () => {
    await resetUserPassword(ctx, str(fd, "userId"), str(fd, "password"));
    return "Password reset. Share it securely.";
  }, ["/settings"]);
}

export async function saveRoleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("settings.manage");
  return act(async () => {
    const r = await saveCustomRole(ctx, {
      id: optStr(fd, "id") ?? undefined,
      name: str(fd, "name"),
      description: optStr(fd, "description"),
      permissions: fd.getAll("permissions").map(String),
      scope: (str(fd, "scope") || "TEAM") as "TEAM",
    });
    return `Role "${r.name}" saved`;
  }, ["/settings"]);
}

export async function deleteRoleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("settings.manage");
  return act(async () => {
    await deleteCustomRole(ctx, str(fd, "id"));
    return "Role deleted";
  }, ["/settings"]);
}

export async function planAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("billing.manage");
  return act(async () => {
    await changePlan(ctx, str(fd, "plan"), str(fd, "cycle") as "MONTHLY");
    revalidatePath("/", "layout");
    return "Plan updated";
  }, [], { allowReadOnly: true });
}

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  return act(async () => {
    if (str(fd, "next") !== str(fd, "confirm")) throw new DomainError("New passwords don't match.");
    await changeOwnPassword(ctx, str(fd, "current"), str(fd, "next"));
    return "Password changed 🔐";
  });
}

export async function checkoutAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("billing.manage");
  let ok = false;
  const res = await act(
    async () => {
      const r = await checkout(ctx, {
        plan: str(fd, "plan") as PlanKey,
        cycle: (str(fd, "cycle") || "MONTHLY") as "MONTHLY",
        method: (str(fd, "method") || "FPX") as "FPX",
        instrument: str(fd, "instrument") || str(fd, "bank"),
      });
      ok = true;
      return `Payment received (${r.invoice.number}). Subscription active until ${r.periodEnd.toISOString().slice(0, 10)} 🎉`;
    },
    ["/", "/settings"],
    { allowReadOnly: true },
  );
  if (ok) redirect("/settings?tab=billing&paid=1");
  return res;
}

export async function cancelSubscriptionAction(_: ActionState, _fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("billing.manage");
  return act(async () => {
    await cancelSubscription(ctx);
    return "Subscription cancelled. You keep full access until the end of the paid period.";
  }, ["/", "/settings"], { allowReadOnly: true });
}

export async function closeWorkspaceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("settings.manage");
  const res = await act(async () => {
    await closeWorkspace(ctx, str(fd, "confirm"));
    return "Workspace closed";
  }, [], { allowReadOnly: true });
  if (res?.ok) redirect("/login");
  return res;
}
