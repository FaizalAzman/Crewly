"use server";

import { redirect } from "next/navigation";
import { requestPasswordReset, resetPassword } from "@/server/services/auth.service";
import { DomainError, type ActionState } from "@/server/types";
import { str } from "@/lib/utils";

export async function forgotAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, "email");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Enter a valid email." };
  const r = await requestPasswordReset(email);
  return { ok: true, message: "If that email has an account, a reset link is on its way.", data: r.devLink ? { devLink: r.devLink } : null };
}

export async function resetAction(_: ActionState, fd: FormData): Promise<ActionState> {
  if (str(fd, "password") !== str(fd, "confirm")) return { ok: false, error: "Passwords don't match." };
  try {
    await resetPassword(str(fd, "token"), str(fd, "password"));
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    throw e;
  }
  redirect("/login?reset=1");
}
