import { prisma } from "@/lib/db";
import { holidayAppliesToState, type WorkWeek } from "@/lib/calendar";
import { toISODate } from "@/lib/utils";

/** Public holidays (system + tenant company holidays) applying to a state within a range, as ISO date strings. */
export async function holidaySet(tenantId: string, state: string, from: Date, to: Date): Promise<Set<string>> {
  const rows = await prisma.publicHoliday.findMany({
    where: { date: { gte: from, lte: to }, OR: [{ tenantId: null }, { tenantId }] },
  });
  return new Set(rows.filter((h) => h.kind === "COMPANY" || holidayAppliesToState(h.states, state)).map((h) => toISODate(h.date)));
}

export async function holidaysForYear(tenantId: string, year: number, state?: string) {
  const rows = await prisma.publicHoliday.findMany({
    where: { year, OR: [{ tenantId: null }, { tenantId }] },
    orderBy: { date: "asc" },
  });
  return state ? rows.filter((h) => h.kind === "COMPANY" || holidayAppliesToState(h.states, state)) : rows;
}

export async function tenantWorkWeek(tenantId: string): Promise<WorkWeek> {
  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  return { restDay: t.restDay, offDay: t.offDay, workDaysPerWeek: t.workDaysPerWeek };
}

/** The state whose holidays apply to an employee: branch → company → home state. */
export async function employeeWorkState(employeeId: string): Promise<string> {
  const e = await prisma.employee.findUniqueOrThrow({
    where: { id: employeeId },
    select: { state: true, branch: { select: { state: true } }, company: { select: { state: true } } },
  });
  return e.branch?.state ?? e.company?.state ?? e.state;
}
