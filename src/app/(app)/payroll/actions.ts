"use server";

import { redirect } from "next/navigation";
import { act } from "@/server/action";
import { requireCtx } from "@/server/context";
import {
  addAdjustment,
  removeAdjustment,
  approvePayrollRun,
  calculatePayrollRun,
  createPayrollRun,
  deletePayrollRun,
  lockPayrollRun,
  markPayrollPaid,
  reopenPayrollRun,
} from "@/server/services/payroll.service";
import { DomainError, type ActionState } from "@/server/types";
import { dateField, numField, optStr, str } from "@/lib/utils";

export async function createRunAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("payroll.manage");
  let id = "";
  const res = await act(async () => {
    const run = await createPayrollRun(ctx, { companyId: str(fd, "companyId"), period: str(fd, "period"), payDate: dateField(fd, "payDate") ?? new Date(), notes: optStr(fd, "notes") ?? undefined });
    id = run.id;
    if (str(fd, "calculate") === "on") await calculatePayrollRun(ctx, run.id);
    return "Payroll run created";
  }, ["/payroll"]);
  if (res?.ok) redirect(`/payroll/${id}`);
  return res;
}

export async function runStepAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("payroll.manage");
  const id = str(fd, "id");
  const step = str(fd, "step");
  let deleted = false;
  const res = await act(async () => {
    switch (step) {
      case "calculate": {
        const { run, warnings } = await calculatePayrollRun(ctx, id);
        return `Calculated ${run.headcount} payslips${warnings.length ? ` · ${warnings.length} warning(s)` : ""}`;
      }
      case "approve":
        await approvePayrollRun(ctx, id);
        return "Payroll approved ✅";
      case "pay":
        await markPayrollPaid(ctx, id);
        return "Marked as paid. Payslips are now visible to employees 💸";
      case "lock":
        await lockPayrollRun(ctx, id);
        return "Run locked 🔒";
      case "reopen":
        await reopenPayrollRun(ctx, id);
        return "Run reopened for changes";
      case "delete":
        await deletePayrollRun(ctx, id);
        deleted = true;
        return "Run deleted";
      default:
        throw new DomainError("Unknown step");
    }
  }, ["/payroll", `/payroll/${id}`, "/dashboard", "/statutory"]);
  if (res?.ok && deleted) redirect("/payroll");
  return res;
}

export async function adjustmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("payroll.manage");
  const runId = optStr(fd, "runId");
  return act(async () => {
    const { recalculate } = await addAdjustment(ctx, { employeeId: str(fd, "employeeId"), payItemId: str(fd, "payItemId"), period: str(fd, "period"), amount: numField(fd, "amount"), note: optStr(fd, "note") ?? undefined });
    return recalculate.length ? `Adjustment added. Payroll ${recalculate.join(", ")} went back to draft: recalculate it before approving.` : "Adjustment added. It will be included when the payroll is calculated.";
  }, ["/payroll", ...(runId ? [`/payroll/${runId}`] : [])]);
}

export async function removeAdjustmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("payroll.manage");
  return act(async () => {
    const stale = await removeAdjustment(ctx, str(fd, "id"));
    return stale.length ? `Removed. Recalculate payroll ${stale.join(", ")} before approving.` : "Removed";
  }, ["/payroll"]);
}
