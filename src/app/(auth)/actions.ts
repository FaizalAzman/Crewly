"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authenticate, signup } from "@/server/services/auth.service";
import { SESSION_COOKIE } from "@/lib/auth/session-token";
import { startSession } from "@/server/session";
import { DomainError, type ActionState } from "@/server/types";
import { ZodError } from "zod";
import { str } from "@/lib/utils";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { ctxFromUser } from "@/server/ctx";
import { safeNext } from "@/lib/auth/safe-next";

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let landing = "/me";
  try {
    const user = await authenticate(str(fd, "email"), str(fd, "password"));
    await startSession(user);
    const full = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { customRole: true } });
    landing = safeNext(str(fd, "next")) ?? (can(ctxFromUser(full), "employee.view") ? "/dashboard" : "/me");
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    throw e;
  }
  redirect(landing);
}

export async function signupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { user } = await signup({
      companyName: str(fd, "companyName"),
      name: str(fd, "name"),
      email: str(fd, "email"),
      password: str(fd, "password"),
      state: str(fd, "state") || "SELANGOR",
      headcount: Number(str(fd, "headcount") || 20),
    });
    await startSession(user);
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? "Please check the form" };
    throw e;
  }
  redirect("/welcome");
}

export async function logoutAction() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
