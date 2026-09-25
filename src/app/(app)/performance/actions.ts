"use server";

import { act } from "@/server/action";
import { requireCtx } from "@/server/context";
import { calibrate, launchCycle, submitManagerReview } from "@/server/services/talent.service";
import { prisma } from "@/lib/db";
import type { ActionState } from "@/server/types";
import { dateField, numField, optStr, str } from "@/lib/utils";

export async function launchCycleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("performance.manage");
  return act(async () => {
    const c = await launchCycle(ctx, { name: str(fd, "name"), type: str(fd, "type"), startDate: dateField(fd, "startDate") as Date, endDate: dateField(fd, "endDate") as Date });
    const n = await prisma.performanceReview.count({ where: { cycleId: c.id } });
    return `Cycle launched: ${n} reviews created`;
  }, ["/performance"]);
}

export async function managerReviewAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("performance.review");
  const cycleId = str(fd, "cycleId");
  return act(async () => {
    await submitManagerReview(ctx, str(fd, "reviewId"), { rating: numField(fd, "rating"), comment: str(fd, "comment"), strengths: optStr(fd, "strengths") ?? undefined, improvements: optStr(fd, "improvements") ?? undefined });
    return "Review submitted for calibration";
  }, [`/performance/${cycleId}`, "/performance"]);
}

export async function calibrateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("performance.manage");
  const cycleId = str(fd, "cycleId");
  return act(async () => {
    await calibrate(ctx, str(fd, "reviewId"), numField(fd, "finalRating"));
    return "Final rating locked";
  }, [`/performance/${cycleId}`, "/performance"]);
}

export async function closeCycleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("performance.manage");
  return act(async () => {
    await prisma.reviewCycle.update({ where: { id: str(fd, "id"), tenantId: ctx.tenantId }, data: { status: str(fd, "status") } });
    return "Cycle updated";
  }, ["/performance"]);
}
