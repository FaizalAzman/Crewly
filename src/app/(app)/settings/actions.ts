"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/action";
import { requireCtx } from "@/server/context";
import { changeOwnPassword, changePlan, changeUserRole, inviteUser, resetUserPassword, setUserActive, updateWorkspace } from "@/server/services/settings.service";
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
    return `${u.name} can now log in. Share the temporary password securely.`;
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
  });
}

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  return act(async () => {
    if (str(fd, "next") !== str(fd, "confirm")) throw new DomainError("New passwords don't match.");
    await changeOwnPassword(ctx, str(fd, "current"), str(fd, "next"));
    return "Password changed 🔐";
  });
}
