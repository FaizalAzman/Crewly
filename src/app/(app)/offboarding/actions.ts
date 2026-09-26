"use server";

import { act } from "@/server/action";
import { requireCtx } from "@/server/context";
import { approveSeparation, completeSeparation, createSeparation, markCp22a, postFinalSettlement, withdrawSeparation, type SeparationType } from "@/server/services/lifecycle.service";
import type { ActionState } from "@/server/types";
import { boolField, dateField, optStr, str } from "@/lib/utils";

const P = ["/offboarding", "/employees", "/dashboard", "/tax", "/payroll"];

export async function createSeparationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("lifecycle.manage");
  return act(async () => {
    const s = await createSeparation(ctx, {
      employeeId: str(fd, "employeeId"),
      type: str(fd, "type") as SeparationType,
      noticeDate: dateField(fd, "noticeDate") ?? new Date(),
      lastWorkingDate: dateField(fd, "lastWorkingDate") as Date,
      reason: optStr(fd, "reason"),
      waiveShortfall: boolField(fd, "waiveShortfall"),
    });
    return s.shortfallDays ? `Recorded. Notice shortfall: ${s.shortfallDays} day(s).` : "Separation recorded";
  }, P);
}

export async function separationStepAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("lifecycle.manage");
  const id = str(fd, "id");
  return act(async () => {
    switch (str(fd, "step")) {
      case "approve":
        await approveSeparation(ctx, id);
        return "Approved. Offboarding checklist created.";
      case "cp22a":
        await markCp22a(ctx, id);
        return "CP22A marked as submitted";
      case "settle": {
        const r = await postFinalSettlement(ctx, id);
        return `Final settlement posted to ${r.period} payroll. Recalculate that run to include it.`;
      }
      case "withdraw":
        await withdrawSeparation(ctx, id);
        return "Separation withdrawn";
      case "complete":
        await completeSeparation(ctx, id, { exitInterview: optStr(fd, "exitInterview") ?? undefined, rehireEligible: boolField(fd, "rehireEligible") });
        return "Separation completed. Login deactivated.";
    }
    return "Nothing to do";
  }, P);
}
