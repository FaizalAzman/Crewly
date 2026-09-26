import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session-token";

// Pages anyone can open. Everything else needs a session.
const PUBLIC = [/^\/$/, /^\/login$/, /^\/signup$/, /^\/forgot-password$/, /^\/reset-password$/, /^\/careers(\/|$)/];

/**
 * Optimistic auth check: signed-out visitors are redirected before any page renders or touches the database,
 * and keep their destination in `?next=` so they land back there after logging in. The real checks (active user,
 * tenant access, permissions) still happen in the layouts, actions and services.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname + search);
  const res = NextResponse.redirect(login);
  // An expired or tampered cookie is useless; clear it so the browser stops sending it.
  if (request.cookies.has(SESSION_COOKIE)) res.cookies.delete(SESSION_COOKIE);
  return res;
}

export const config = {
  // API routes do their own auth (and must answer 401/403, not redirect); static assets skip the proxy entirely.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml|webmanifest)$).*)"],
};
