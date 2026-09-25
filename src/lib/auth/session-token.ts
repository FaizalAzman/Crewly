import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "crewly_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

export interface SessionPayload {
  uid: string;
  tid: string;
  role: string;
}

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET must be set (≥ 16 chars)");
  return new TextEncoder().encode(s);
}

export async function signSession(payload: SessionPayload, ttlSeconds = SESSION_TTL_SECONDS) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.uid !== "string" || typeof payload.tid !== "string") return null;
    return { uid: payload.uid, tid: payload.tid, role: String(payload.role ?? "EMPLOYEE") };
  } catch {
    return null;
  }
}
