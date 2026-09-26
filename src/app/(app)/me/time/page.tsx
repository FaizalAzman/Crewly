import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { ActionButton } from "@/components/forms";
import { OvertimeButton } from "@/components/request-forms";
import { Badge, Card, CardHeader, EmptyState, Money, PageHeader, StatCard, StatusBadge, Table, TD, TH, THead, TR } from "@/components/ui";
import { fmtDate, fmtTime, todayMY } from "@/lib/utils";
import { humanize } from "@/lib/constants";
import { enrollAction } from "../actions";

export const metadata: Metadata = { title: "My time & training" };

export default async function MyTimePage() {
  const ctx = await requireCtx();
  const id = ctx.employeeId!;
  const today = todayMY();
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const [att, ot, enrolments, upcoming] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { employeeId: id, date: { gte: from } }, orderBy: { date: "desc" } }),
    prisma.overtimeRequest.findMany({ where: { employeeId: id }, orderBy: { date: "desc" }, take: 30 }),
    prisma.trainingEnrollment.findMany({ where: { employeeId: id }, include: { program: true }, orderBy: { program: { startDate: "desc" } } }),
    prisma.trainingProgram.findMany({ where: { tenantId: ctx.tenantId, status: "SCHEDULED", startDate: { gte: today }, enrollments: { none: { employeeId: id } } }, include: { _count: { select: { enrollments: true } } }, orderBy: { startDate: "asc" } }),
  ]);
  const worked = att.reduce((s, a) => s + a.workedMinutes, 0);
  return (
    <>
      <PageHeader title="Time & training" emoji="⏱️" subtitle="Your attendance this month, overtime claims and training." actions={<OvertimeButton tenantId={ctx.tenantId} />} />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Days clocked in" value={att.filter((a) => a.clockIn).length} tone="lime" emoji="✅" />
        <StatCard label="Late arrivals" value={att.filter((a) => a.lateMinutes > 0).length} tone="sunny" emoji="⏰" />
        <StatCard label="Hours worked" value={(worked / 60).toFixed(1)} tone="sky" emoji="⌛" />
        <StatCard label="OT pending" value={ot.filter((o) => o.status === "PENDING").length} tone="bubblegum" emoji="🕘" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Attendance this month" emoji="📍" />
          {att.length === 0 ? <EmptyState emoji="📍" title="No clock-ins yet this month" /> : (
            <Table>
              <THead><tr><TH>Date</TH><TH>In</TH><TH>Out</TH><TH>Status</TH></tr></THead>
              <tbody>
                {att.map((a) => (
                  <TR key={a.id}>
                    <TD className="text-xs">{fmtDate(a.date)}</TD>
                    <TD className="font-mono text-xs">{fmtTime(a.clockIn)}</TD>
                    <TD className="font-mono text-xs">{fmtTime(a.clockOut)}</TD>
                    <TD>
                      <StatusBadge status={a.status} />
                      {a.lateMinutes > 0 && <span className="ml-1 text-xs text-muted">+{a.lateMinutes}m</span>}
                      {!a.withinFence && a.clockIn && <Badge tone="orange" className="ml-1">{a.note ?? "Outside fence"}</Badge>}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="My overtime claims" emoji="🕘" />
          {ot.length === 0 ? <EmptyState emoji="🕘" title="No overtime claims" /> : (
            <Table>
              <THead><tr><TH>Date</TH><TH>Type</TH><TH>Hours</TH><TH className="text-right">Pay</TH><TH>Status</TH></tr></THead>
              <tbody>
                {ot.map((o) => (
                  <TR key={o.id}>
                    <TD className="text-xs">{fmtDate(o.date)}</TD>
                    <TD className="text-xs">{humanize(o.dayType)} · {o.multiplier}×</TD>
                    <TD className="text-xs">{o.hours}h{o.normalHours ? ` + ${o.normalHours}h` : ""}</TD>
                    <TD className="text-right"><Money value={o.amount} /></TD>
                    <TD><StatusBadge status={o.status} /></TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="My training" emoji="🎓" />
          {enrolments.length === 0 ? <EmptyState emoji="🎓" title="No training yet" /> : (
            <Table>
              <THead><tr><TH>Programme</TH><TH>Dates</TH><TH>Status</TH></tr></THead>
              <tbody>
                {enrolments.map((en) => (
                  <TR key={en.id}>
                    <TD className="font-semibold">{en.program.title}<span className="block text-xs text-muted">{en.program.provider} · {en.program.hours}h</span></TD>
                    <TD className="text-xs">{fmtDate(en.program.startDate)}</TD>
                    <TD><StatusBadge status={en.status} />{en.score != null && <span className="ml-1 text-xs">{en.score}%</span>}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="Open for enrolment" emoji="📚" />
          {upcoming.length === 0 ? <EmptyState emoji="📚" title="Nothing open right now" /> : (
            <Table>
              <THead><tr><TH>Programme</TH><TH>Starts</TH><TH>Seats</TH><TH /></tr></THead>
              <tbody>
                {upcoming.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-semibold">{p.title}<span className="block text-xs text-muted">{p.provider} · {humanize(p.mode)}</span></TD>
                    <TD className="text-xs">{fmtDate(p.startDate)}</TD>
                    <TD className="text-xs">{p.capacity - p._count.enrollments} left</TD>
                    <TD className="text-right">{p._count.enrollments < p.capacity && <ActionButton action={enrollAction} fields={{ programId: p.id }} variant="lime">Enrol</ActionButton>}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
