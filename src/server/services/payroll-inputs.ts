import { prisma } from "@/lib/db";

/**
 * A payroll input changed after the run was calculated (an adjustment, a manual loan repayment, unpaid leave).
 * Send those calculated runs back to draft so the stale figures can't be approved; payroll recalculates them.
 * Returns the affected periods (empty when nothing was calculated yet).
 */
export async function invalidateCalculatedRuns(tenantId: string, where: { companyId: string; periods: string[] } | { runIds: string[] }) {
  const filter = "runIds" in where ? { id: { in: where.runIds } } : { companyId: where.companyId, period: { in: where.periods } };
  const runs = await prisma.payrollRun.findMany({ where: { tenantId, status: "CALCULATED", ...filter }, select: { id: true, period: true } });
  if (!runs.length) return [];
  await prisma.payrollRun.updateMany({ where: { id: { in: runs.map((r) => r.id) }, status: "CALCULATED" }, data: { status: "DRAFT" } });
  return runs.map((r) => r.period);
}

/** Periods (YYYY-MM) touched by a date range. */
export function periodsBetween(start: Date, end: Date) {
  const out: string[] = [];
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  const endKey = end.getUTCFullYear() * 12 + end.getUTCMonth();
  while (y * 12 + m <= endKey && out.length < 24) {
    out.push(`${y}-${String(m + 1).padStart(2, "0")}`);
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return out;
}
