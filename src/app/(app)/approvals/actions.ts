"use server";

import { act } from "@/server/action";
import { requireCtx } from "@/server/context";
import { approveLeave, rejectLeave } from "@/server/services/leave.service";
import { approveCompensation, decideClaim, decideLoan, rejectCompensation } from "@/server/services/money.service";
import { decideOvertime } from "@/server/services/time.service";
import { DomainError, type ActionState } from "@/server/types";
import { optStr, str } from "@/lib/utils";

const PATHS = ["/approvals", "/leave", "/claims", "/overtime", "/loans", "/compensation", "/dashboard", "/me"];

export async function decideAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  const kind = str(fd, "kind");
  const id = str(fd, "id");
  const approve = str(fd, "decision") === "approve";
  const note = optStr(fd, "note") ?? undefined;
  return act(async () => {
    switch (kind) {
      // Rejections carry the approver's own reason; the services refuse a blank one.
      case "leave":
        if (approve) await approveLeave(ctx, id, note);
        else await rejectLeave(ctx, id, note);
        break;
      case "claim":
        await decideClaim(ctx, id, approve, note);
        break;
      case "overtime":
        await decideOvertime(ctx, id, approve);
        break;
      case "loan":
        await decideLoan(ctx, id, approve);
        break;
      case "compensation":
        if (approve) await approveCompensation(ctx, id);
        else await rejectCompensation(ctx, id);
        break;
      default:
        throw new DomainError("Unknown request type.");
    }
    return approve ? "Approved ✅" : "Rejected";
  }, PATHS);
}

/** Approve every pending item of a kind that the actor is allowed to approve. */
export async function bulkApproveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  const ids = fd.getAll("ids").map(String);
  const kind = str(fd, "kind");
  return act(async () => {
    if (!["leave", "claim", "overtime"].includes(kind)) throw new DomainError("Bulk approval covers leave, claims and overtime.");
    if (ids.length === 0) throw new DomainError("Nothing selected.");
    if (ids.length > 200) throw new DomainError("Approve at most 200 items at a time.");
    let ok = 0;
    const errors: string[] = [];
    for (const id of ids) {
      try {
        if (kind === "leave") await approveLeave(ctx, id);
        if (kind === "claim") await decideClaim(ctx, id, true);
        if (kind === "overtime") await decideOvertime(ctx, id, true);
        ok++;
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
    return `Approved ${ok} item(s)${errors.length ? ` · ${errors.length} skipped` : ""}`;
  }, PATHS);
}
