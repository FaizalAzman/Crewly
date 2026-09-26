"use server";

import { act } from "@/server/action";
import { requireCtx } from "@/server/context";
import { applyLeave, cancelLeave } from "@/server/services/leave.service";
import { cancelClaim, requestLoan, submitClaim } from "@/server/services/money.service";
import { clockIn, clockOut, requestOvertime } from "@/server/services/time.service";
import { saveTaxDeclaration } from "@/server/services/tax.service";
import { acknowledgePolicy, respondSurvey, giveKudos, openTicket, commentTicket } from "@/server/services/culture.service";
import { submitSelfReview, updateGoalProgress, setGoal, enroll } from "@/server/services/talent.service";
import { createSeparation } from "@/server/services/lifecycle.service";
import { toggleTask } from "@/server/services/lifecycle.service";
import { fileGrievance } from "@/server/services/relations.service";
import { DomainError, type ActionState } from "@/server/types";
import { fileOrText } from "@/server/services/upload.service";
import { boolField, dateField, numField, optStr, str, todayMY } from "@/lib/utils";

function required<T>(v: T | null | undefined, message: string): T {
  if (v === null || v === undefined) throw new DomainError(message);
  return v;
}

function me(ctx: { employeeId: string | null }) {
  if (!ctx.employeeId) throw new DomainError("Your login isn't linked to an employee profile.");
  return ctx.employeeId;
}

export async function clockInAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  return act(async () => {
    const lat = str(fd, "lat") ? numField(fd, "lat") : null;
    const lng = str(fd, "lng") ? numField(fd, "lng") : null;
    const rec = await clockIn(ctx, { lat, lng, source: str(fd, "source") || "WEB" });
    return rec.lateMinutes ? `Clocked in (${rec.lateMinutes} min late)` : rec.withinFence ? "Clocked in. Have a great day! ☀️" : "Clocked in (outside the office geofence)";
  }, ["/me", "/attendance"]);
}

export async function clockOutAction(): Promise<ActionState> {
  const ctx = await requireCtx();
  return act(async () => {
    const rec = await clockOut(ctx, {});
    return `Clocked out after ${Math.floor(rec.workedMinutes / 60)}h ${rec.workedMinutes % 60}m. See you tomorrow 👋`;
  }, ["/me", "/attendance"]);
}

export async function applyLeaveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  return act(async () => {
    const employeeId = str(fd, "employeeId") || me(ctx);
    const start = dateField(fd, "startDate");
    const end = dateField(fd, "endDate") ?? start;
    if (!start || !end) throw new DomainError("Pick your leave dates.");
    const r = await applyLeave(ctx, {
      employeeId,
      leaveTypeId: str(fd, "leaveTypeId"),
      startDate: start,
      endDate: end,
      halfDay: (optStr(fd, "halfDay") as "AM" | "PM" | null) ?? null,
      reason: optStr(fd, "reason"),
      attachment: await fileOrText(ctx, fd, "attachmentFile", "attachment", "LEAVE"),
    });
    return `Leave submitted: ${r.days} day(s). Your manager has been notified.`;
  }, ["/me", "/me/leave", "/leave", "/approvals"]);
}

export async function cancelLeaveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  return act(async () => {
    await cancelLeave(ctx, str(fd, "id"));
    return "Leave cancelled and balance restored";
  }, ["/me", "/me/leave", "/leave"]);
}

export async function submitClaimAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  return act(async () => {
    const c = await submitClaim(ctx, {
      employeeId: str(fd, "employeeId") || me(ctx),
      claimTypeId: str(fd, "claimTypeId"),
      date: required(dateField(fd, "date"), "Enter the date of the expense."),
      amount: numField(fd, "amount"),
      mileageKm: str(fd, "mileageKm") ? numField(fd, "mileageKm") : null,
      description: str(fd, "description"),
      merchant: optStr(fd, "merchant"),
      receiptUrl: await fileOrText(ctx, fd, "receiptFile", "receiptUrl", "RECEIPT"),
    });
    return `Claim of RM${c.amount.toFixed(2)} submitted 🧾`;
  }, ["/me", "/me/claims", "/claims", "/approvals"]);
}

export async function cancelClaimAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  return act(async () => {
    await cancelClaim(ctx, str(fd, "id"));
    return "Claim withdrawn";
  }, ["/me/claims", "/claims"]);
}

export async function requestOvertimeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  return act(async () => {
    const r = await requestOvertime(ctx, {
      employeeId: str(fd, "employeeId") || me(ctx),
      date: required(dateField(fd, "date"), "Enter the date you worked overtime."),
      hours: numField(fd, "hours"),
      normalHours: numField(fd, "normalHours"),
      reason: optStr(fd, "reason") ?? undefined,
    });
    return `OT submitted: ${r.dayType.replace("_", " ").toLowerCase()} at ${r.multiplier}× = RM${r.amount.toFixed(2)}`;
  }, ["/me", "/overtime", "/approvals"]);
}

export async function requestLoanAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  return act(async () => {
    await requestLoan(ctx, {
      employeeId: str(fd, "employeeId") || me(ctx),
      type: (str(fd, "type") || "SALARY_ADVANCE") as "SALARY_ADVANCE",
      principal: numField(fd, "principal"),
      installment: numField(fd, "installment"),
      startPeriod: str(fd, "startPeriod"),
      reason: optStr(fd, "reason") ?? undefined,
    });
    return "Request submitted";
  }, ["/me", "/loans", "/approvals"]);
}

const TP_FIELDS = [
  "prevGross", "prevEpf", "prevPcb", "prevZakat", "lifestyle", "medicalSelf", "medicalParents", "education", "lifeInsurance",
  "educationMedicalInsurance", "prs", "sspn", "childcare", "breastfeeding", "sports", "evCharging", "housingLoanInterest", "vaccination",
];

export async function saveTaxDeclarationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  return act(async () => {
    const data = Object.fromEntries(TP_FIELDS.map((k) => [k, numField(fd, k)]));
    await saveTaxDeclaration(ctx, str(fd, "employeeId") || me(ctx), numField(fd, "year", new Date().getFullYear()), data);
    return "Saved. Next month's PCB will reflect your reliefs.";
  }, ["/me/tax", "/tax"]);
}

export async function ackPolicyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  return act(async () => {
    await acknowledgePolicy(ctx, str(fd, "policyId"));
    return "Acknowledged ✅";
  }, ["/me", "/documents"]);
}

export async function surveyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  return act(async () => {
    const answers: Record<string, string | number> = {};
    for (const [k, v] of fd.entries()) {
      if (!k.startsWith("q_")) continue;
      const key = k.slice(2);
      const n = Number(v);
      answers[key] = v === "" || Number.isNaN(n) || str(fd, `t_${key}`) === "TEXT" ? String(v) : n;
    }
    await respondSurvey(ctx, str(fd, "surveyId"), answers);
    return "Thanks for sharing! 💛";
  }, ["/me", "/engagement"]);
}

export async function kudosAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  return act(async () => {
    await giveKudos(ctx, { toId: str(fd, "toId"), value: str(fd, "value"), message: str(fd, "message"), emoji: str(fd, "emoji") || "🙌" });
    return "Kudos sent! 🎉";
  }, ["/engagement", "/me"]);
}

export async function ticketAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  return act(async () => {
    const t = await openTicket(ctx, { category: str(fd, "category"), subject: str(fd, "subject"), description: str(fd, "description"), priority: str(fd, "priority") || "MEDIUM" });
    return `Ticket ${t.refNo} created. HR will get back to you.`;
  }, ["/helpdesk", "/me"]);
}

export async function ticketCommentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  const id = str(fd, "ticketId");
  return act(async () => {
    await commentTicket(ctx, id, str(fd, "body"), boolField(fd, "internal"));
    return "Reply sent";
  }, [`/helpdesk/${id}`, "/helpdesk"]);
}

export async function selfReviewAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  return act(async () => {
    await submitSelfReview(ctx, str(fd, "reviewId"), numField(fd, "rating"), str(fd, "comment"));
    return "Self-review submitted. Your manager is up next.";
  }, ["/me", "/performance"]);
}

export async function goalProgressAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  return act(async () => {
    await updateGoalProgress(ctx, str(fd, "goalId"), numField(fd, "progress"), optStr(fd, "status") ?? undefined);
    return "Progress updated";
  }, ["/me", "/performance"]);
}

export async function addGoalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  return act(async () => {
    await setGoal(ctx, {
      employeeId: str(fd, "employeeId") || me(ctx),
      cycleId: optStr(fd, "cycleId"),
      title: str(fd, "title"),
      kind: str(fd, "kind") || "KPI",
      weight: numField(fd, "weight", 20),
      target: optStr(fd, "target") ?? undefined,
      dueDate: dateField(fd, "dueDate"),
    });
    return "Goal added 🎯";
  }, ["/me", "/performance"]);
}

export async function enrollAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  return act(async () => {
    await enroll(ctx, str(fd, "programId"), str(fd, "employeeId") || me(ctx));
    return "Enrolled! 🎓";
  }, ["/training", "/me"]);
}

export async function resignAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  return act(async () => {
    await createSeparation(ctx, {
      employeeId: me(ctx),
      type: "RESIGNATION",
      noticeDate: dateField(fd, "noticeDate") ?? todayMY(),
      lastWorkingDate: required(dateField(fd, "lastWorkingDate"), "Enter your proposed last working day."),
      reason: optStr(fd, "reason"),
    });
    return "Resignation submitted to HR";
  }, ["/me", "/offboarding"]);
}

export async function myTaskAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  return act(async () => {
    await toggleTask(ctx, str(fd, "taskId"), str(fd, "done") === "true");
    return "Task updated";
  }, ["/me", "/onboarding"]);
}

export async function grievanceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  return act(async () => {
    const anonymous = boolField(fd, "anonymous");
    const g = await fileGrievance(ctx, {
      employeeId: anonymous ? null : me(ctx),
      anonymous,
      category: str(fd, "category"),
      subject: str(fd, "subject"),
      description: str(fd, "description"),
      against: optStr(fd, "against") ?? undefined,
    });
    return `Submitted confidentially (ref ${g.refNo})`;
  }, ["/me", "/grievances"]);
}
