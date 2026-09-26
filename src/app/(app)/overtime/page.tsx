import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { Badge, Callout, Card, CardHeader, Money, PageHeader, PersonCell, StatCard, StatusBadge, Table, TD, TH, THead, TR } from "@/components/ui";
import { DecideButtons } from "@/components/decide-buttons";
import { OvertimeButton } from "@/components/request-forms";
import { fmtDate, parsePeriod, periodOf, rm, todayMY } from "@/lib/utils";
import { humanize } from "@/lib/constants";
import { MAX_MONTHLY_OT_HOURS } from "@/lib/statutory/employment-act";
import { scopedEmployeeWhere } from "@/server/services/scope";

export const metadata: Metadata = { title: "Overtime" };

export default async function OvertimePage() {
  const ctx = await requireCtx("overtime.approve");
  const scope = await scopedEmployeeWhere(ctx);
  const { start, end } = parsePeriod(periodOf(todayMY()));
  const rows = await prisma.overtimeRequest.findMany({ where: { tenantId: ctx.tenantId, ...scope }, include: { employee: { include: { department: true } } }, orderBy: { date: "desc" }, take: 200 });
  const month = rows.filter((r) => r.date >= start && r.date <= end && r.status !== "REJECTED");
  const byEmp = new Map<string, { name: string; hours: number }>();
  for (const r of month) byEmp.set(r.employeeId, { name: r.employee.fullName, hours: (byEmp.get(r.employeeId)?.hours ?? 0) + r.hours });
  const nearCap = [...byEmp.values()].filter((v) => v.hours > MAX_MONTHLY_OT_HOURS * 0.75);
  return (
    <>
      <PageHeader title="Overtime" emoji="⏱️" subtitle="EA s.60A rates: 1.5× normal day, 2× rest day, 3× public holiday. Hourly rate = (monthly ÷ 26) ÷ normal hours." actions={can(ctx, "attendance.manage") && <OvertimeButton tenantId={ctx.tenantId} onBehalf btn={{ label: "+ OT on behalf", variant: "primary" }} />} />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Pending" value={rows.filter((r) => r.status === "PENDING").length} tone="sunny" emoji="⏳" />
        <StatCard label="Hours this month" value={month.reduce((s, r) => s + r.hours, 0).toFixed(1)} tone="sky" emoji="⌛" />
        <StatCard label="OT cost this month" value={rm(month.reduce((s, r) => s + r.amount, 0), { decimals: 0 })} tone="lime" emoji="💰" />
        <StatCard label={`Near ${MAX_MONTHLY_OT_HOURS}h cap`} value={nearCap.length} tone="bubblegum" emoji="🚨" />
      </div>
      {nearCap.length > 0 && (
        <div className="mb-6">
          <Callout tone="bubblegum" emoji="🚨">
            Approaching the monthly overtime limit: {nearCap.map((n) => `${n.name} (${n.hours}h)`).join(", ")}
          </Callout>
        </div>
      )}
      <Card>
        <CardHeader title="Overtime claims" emoji="🧾" />
        <Table>
          <THead>
            <tr>
              <TH>Employee</TH>
              <TH>Date</TH>
              <TH>Day type</TH>
              <TH>Hours</TH>
              <TH>Reason</TH>
              <TH className="text-right">Pay</TH>
              <TH>Status</TH>
              <TH />
            </tr>
          </THead>
          <tbody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD><PersonCell name={r.employee.fullName} sub={r.employee.department?.name} color={r.employee.avatarColor} /></TD>
                <TD className="text-xs">{fmtDate(r.date)}</TD>
                <TD><Badge tone={r.dayType === "PUBLIC_HOLIDAY" ? "pink" : r.dayType === "REST_DAY" ? "purple" : "gray"}>{humanize(r.dayType)} · {r.multiplier}×</Badge></TD>
                <TD className="text-xs">{r.hours}h OT{r.normalHours ? ` + ${r.normalHours}h` : ""}</TD>
                <TD className="max-w-xs text-xs">{r.reason}</TD>
                <TD className="text-right font-bold"><Money value={r.amount} /></TD>
                <TD><StatusBadge status={r.status} /></TD>
                <TD>{r.status === "PENDING" && <DecideButtons kind="overtime" id={r.id} requireReason={false} />}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
