import "server-only";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { DomainError, type ActionState } from "./types";
import { getSessionUser } from "./context";
import { tenantAccess } from "./services/subscription.service";

/**
 * Wraps a server action body: converts domain / validation errors into ActionState
 * and revalidates the given paths on success.
 */
export async function act(
  fn: () => Promise<string | void | { message?: string; data?: unknown }>,
  paths: string[] = [],
  opts: { allowReadOnly?: boolean } = {},
): Promise<ActionState> {
  try {
    // Read-only workspaces (trial ended, unpaid, cancelled) can still pay; everything else is blocked.
    if (!opts.allowReadOnly) {
      const user = await getSessionUser();
      if (user) {
        const access = tenantAccess(user.tenant);
        if (!access.writable) return { ok: false, error: `${access.message} Go to Settings → Plan & billing.` };
      }
    }
    const res = await fn();
    for (const p of paths) revalidatePath(p);
    if (typeof res === "string") return { ok: true, message: res };
    if (res && typeof res === "object") return { ok: true, message: res.message, data: res.data };
    return { ok: true };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof DomainError) return { ok: false, error: e.message };
    if (e instanceof ZodError) return { ok: false, error: e.issues.map((i) => `${i.path.join(".") || "field"}: ${i.message}`).join("; ") };
    console.error(e);
    return { ok: false, error: "Something went wrong on our side. Please try again." };
  }
}
