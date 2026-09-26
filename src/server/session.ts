import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "@/lib/auth/session-token";

/**
 * Issues the session cookie for this browser. Kept out of any "use server" file on purpose: exporting it from
 * one would make it a client-callable action that could mint sessions for any user.
 */
export async function startSession(user: { id: string; tenantId: string; role: string; sessionVersion: number }) {
  const token = await signSession({ uid: user.id, tid: user.tenantId, role: user.role, sv: user.sessionVersion });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}
