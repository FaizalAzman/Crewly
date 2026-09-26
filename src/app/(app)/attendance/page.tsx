import Link from "next/link";
import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { Badge, Card, CardHeader, Field, Input, PageHeader, PersonCell, Select, StatCard, StatusBadge, Table, Tabs, TD, TH, THead, TR, Textarea } from "@/components/ui";
import { FormModal } from "@/components/forms";
import { act } from "@/server/action";
import { manualAttendance, markAbsentees } from "@/server/services/time.service";
import { ActionButton } from "@/components/forms";
import { addDays, fmtDate, fmtTime, parseDate, str, todayMY, toISODate } from "@/lib/utils";
import type { ActionState } from "@/server/types";

export const metadata: Metadata = { title: "Attendance" };

async function manualAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("attendance.manage");
  return act(async () => {
    const date = parseDate(str(fd, "date"))!;
    const t = (k: string) => (str(fd, k) ? new Date(`${str(fd, "date")}T${str(fd, k)}:00+08:00`) : null);
    await manualAttendance(ctx, { employeeId: str(fd, "employeeId"), date, clockIn: t("in"), clockOut: t("out"), status: str(fd, "status") || "PRESENT", note: str(fd, "note") });
    revalidatePath("/attendance");
    return "Attendance updated";
  });
}

async function absenteesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("attendance.manage");
  return act(async () => {
    const n = await markAbsentees(ctx, parseDate(str(fd, "date"))!);
    revalidatePath("/attendance");
    return n ? `Marked ${n} employee(s) absent` : "Everyone is accounted for 🎉";
  });
}

export default async function AttendancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireCtx("attendance.manage");
  const sp = await searchParams;
  const tab = sp.tab ?? "today";
  const date = parseDate(sp.date) ?? todayMY();
  const [emps, records, leaves] = await Promise.all([
    prisma.employee.findMany({ where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROBATION", "NOTICE"] }, joinDate: { lte: date } }, include: { department: true, branch: true }, orderBy: { fullName: "asc" } }),
    prisma.attendanceRecord.findMany({ where: { tenantId: ctx.tenantId, date } }),
    prisma.leaveRequest.findMany({ where: { tenantId: ctx.tenantId, status: "APPROVED", startDate: { lte: date }, endDate: { gte: date } }, include: { leaveType: true } }),
  ]);
  const rec = new Map(records.map((r) => [r.employeeId, r]));
  const onLeave = new Map(leaves.map((l) => [l.employeeId, l]));
  const present = records.filter((r) => r.clockIn).length;
  const late = records.filter((r) => r.status === "LATE").length;
  const outside = records.filter((r) => r.clockIn && !r.withinFence).length;
  const missing = emps.filter((e) => !rec.get(e.id)?.clockIn && !onLeave.has(e.id)).length;
  const empOpts = emps.map((e) => ({ value: e.id, label: e.fullName }));

  return (
    <>
      <PageHeader
        title="Attendance"
        emoji="📍"
        subtitle="Web and mobile clock-ins with GPS geofence, lateness and timesheets."
        actions={
          <>
          <ActionButton action={absenteesAction} fields={{ date: toISODate(date) }} variant="secondary" size="md" confirm={`Mark everyone without a clock-in on ${toISODate(date)} (and not on leave) as ABSENT?`}>
            Mark absentees
          </ActionButton>
          <FormModal trigger="Manual entry" triggerVariant="secondary" title="Manual attendance entry" subtitle="Changes are audited." action={manualAction}>
            <Field label="Employee">
              <Select name="employeeId" options={empOpts} />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Date">
                <Input type="date" name="date" defaultValue={toISODate(date)} required />
              </Field>
              <Field label="In">
                <Input type="time" name="in" defaultValue="09:00" />
              </Field>
              <Field label="Out">
                <Input type="time" name="out" defaultValue="18:00" />
              </Field>
            </div>
            <Field label="Status">
              <Select name="status" options={["PRESENT", "LATE", "ABSENT", "ON_LEAVE", "HOLIDAY"]} />
            </Field>
            <Field label="Reason (required)">
              <Textarea name="note" required placeholder="Forgot to clock in, verified by manager" />
            </Field>
          </FormModal>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatCard label="Clocked in" value={`${present}/${emps.length}`} tone="lime" emoji="✅" />
        <StatCard label="Late" value={late} tone="sunny" emoji="⏰" />
        <StatCard label="On leave" value={leaves.length} tone="sky" emoji="🌴" />
        <StatCard label="Outside geofence" value={outside} tone="bubblegum" emoji="📡" />
        <StatCard label="Not in yet" value={missing} tone="white" emoji="❓" />
      </div>
      <Tabs active={tab} tabs={[{ key: "today", label: "Daily board", href: `/attendance?tab=today&date=${toISODate(date)}` }, { key: "timesheet", label: "Monthly timesheet", href: "/attendance?tab=timesheet" }]} />
      {tab === "today" ? (
        <Card>
          <CardHeader
            title={fmtDate(date, "long")}
            emoji="🗓️"
            action={
              <div className="flex gap-2">
                <Link href={`/attendance?date=${toISODate(addDays(date, -1))}`} className="rounded-lg border-2 border-ink px-2 py-1 text-xs font-bold">← Prev</Link>
                <Link href={`/attendance?date=${toISODate(addDays(date, 1))}`} className="rounded-lg border-2 border-ink px-2 py-1 text-xs font-bold">Next →</Link>
              </div>
            }
          />
          <Table>
            <THead>
              <tr>
                <TH>Employee</TH>
                <TH>Branch</TH>
                <TH>In</TH>
                <TH>Out</TH>
                <TH>Worked</TH>
                <TH>Status</TH>
                <TH>Location</TH>
              </tr>
            </THead>
            <tbody>
              {emps.map((e) => {
                const r = rec.get(e.id);
                const l = onLeave.get(e.id);
                return (
                  <TR key={e.id}>
                    <TD>
                      <PersonCell name={e.fullName} sub={e.department?.name} color={e.avatarColor} />
                    </TD>
                    <TD className="text-xs">{e.branch?.name ?? "-"}</TD>
                    <TD className="font-mono text-xs">{r?.clockIn ? fmtTime(r.clockIn) : "-"}</TD>
                    <TD className="font-mono text-xs">{r?.clockOut ? fmtTime(r.clockOut) : "-"}</TD>
                    <TD className="font-mono text-xs">{r?.workedMinutes ? `${Math.floor(r.workedMinutes / 60)}h ${r.workedMinutes % 60}m` : "-"}</TD>
                    <TD>
                      {l ? (
                        <Badge tone="blue">
                          {l.leaveType.emoji} {l.leaveType.code}
                        </Badge>
                      ) : r ? (
                        <>
                          <StatusBadge status={r.status} />
                          {r.lateMinutes > 0 && <span className="ml-1 text-xs text-muted">+{r.lateMinutes}m</span>}
                        </>
                      ) : (
                        <Badge tone="gray">No record</Badge>
                      )}
                    </TD>
                    <TD className="text-xs">
                      {r?.clockIn && (r.withinFence ? <Badge tone="green">In fence</Badge> : <Badge tone="orange">⚠ {r.note ?? "Outside"}</Badge>)}
                      {r?.source && <span className="ml-1 text-muted">{r.source.toLowerCase()}</span>}
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </Card>
      ) : (
        <Timesheet tenantId={ctx.tenantId} />
      )}
    </>
  );
}

async function Timesheet({ tenantId }: { tenantId: string }) {
  const today = todayMY();
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const emps = await prisma.employee.findMany({
    where: { tenantId, status: { in: ["ACTIVE", "PROBATION", "NOTICE"] } },
    include: { attendance: { where: { date: { gte: from, lte: today } } }, department: true },
    orderBy: { fullName: "asc" },
  });
  return (
    <Card>
      <CardHeader title={`Month to date · ${fmtDate(from, "long")} – ${fmtDate(today, "long")}`} emoji="🧾" />
      <Table>
        <THead>
          <tr>
            <TH>Employee</TH>
            <TH className="text-right">Days present</TH>
            <TH className="text-right">Late days</TH>
            <TH className="text-right">Late minutes</TH>
            <TH className="text-right">Hours worked</TH>
            <TH className="text-right">Avg / day</TH>
            <TH className="text-right">Outside fence</TH>
          </tr>
        </THead>
        <tbody>
          {emps.map((e) => {
            const a = e.attendance.filter((r) => r.clockIn);
            const mins = a.reduce((s, r) => s + r.workedMinutes, 0);
            const lateDays = a.filter((r) => r.lateMinutes > 0).length;
            return (
              <TR key={e.id}>
                <TD>
                  <PersonCell name={e.fullName} sub={e.department?.name} color={e.avatarColor} />
                </TD>
                <TD className="text-right">{a.length}</TD>
                <TD className="text-right">{lateDays > 3 ? <Badge tone="orange">{lateDays}</Badge> : lateDays}</TD>
                <TD className="text-right">{a.reduce((s, r) => s + r.lateMinutes, 0)}</TD>
                <TD className="text-right font-mono">{(mins / 60).toFixed(1)}</TD>
                <TD className="text-right font-mono">{a.length ? (mins / 60 / a.length).toFixed(1) : "-"}</TD>
                <TD className="text-right">{a.filter((r) => !r.withinFence).length}</TD>
              </TR>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}
