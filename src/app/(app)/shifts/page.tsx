import Link from "next/link";
import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { Avatar, Callout, Card, CardHeader, Checkbox, Field, Input, PageHeader, Select } from "@/components/ui";
import { FormModal } from "@/components/forms";
import { act } from "@/server/action";
import { assignShift, weeksWithoutRestDay } from "@/server/services/time.service";
import { addDays, boolField, fmtDate, numField, optStr, parseDate, str, todayMY, toISODate } from "@/lib/utils";
import { DomainError, type ActionState } from "@/server/types";

export const metadata: Metadata = { title: "Shifts & roster" };

async function assignAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("attendance.manage");
  return act(async () => {
    const from = parseDate(str(fd, "from"))!;
    const to = parseDate(str(fd, "to")) ?? from;
    if (to < from) throw new DomainError("End date is before start date.");
    const ids = fd.getAll("employeeIds").map(String);
    if (!ids.length) throw new DomainError("Pick at least one employee.");
    const dayType = (str(fd, "dayType") || "WORK") as "WORK";
    for (const id of ids) for (let d = from; d <= to; d = addDays(d, 1)) await assignShift(ctx, { employeeId: id, date: d, shiftId: optStr(fd, "shiftId"), dayType });
    revalidatePath("/shifts");
    return `Rostered ${ids.length} employee(s)`;
  });
}

async function saveShiftAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx("attendance.manage");
  return act(async () => {
    const data = { name: str(fd, "name"), code: str(fd, "code").toUpperCase(), startTime: str(fd, "startTime"), endTime: str(fd, "endTime"), breakMinutes: numField(fd, "breakMinutes", 60), color: str(fd, "color") || "#5CC8FF", overnight: boolField(fd, "overnight") };
    if (!data.name || !data.code) throw new DomainError("Name and code are required.");
    const [sh, sm] = data.startTime.split(":").map(Number);
    const [eh, em] = data.endTime.split(":").map(Number);
    let mins = eh * 60 + em - (sh * 60 + sm);
    if (mins <= 0) mins += 24 * 60;
    if (mins - data.breakMinutes > 12 * 60) throw new DomainError("Shifts can't exceed 12 working hours (EA s.60A).");
    await prisma.shift.create({ data: { ...data, tenantId: ctx.tenantId } });
    revalidatePath("/shifts");
    return "Shift created";
  });
}

export default async function ShiftsPage({ searchParams }: { searchParams: Promise<{ week?: string; dept?: string }> }) {
  const ctx = await requireCtx("attendance.manage");
  const sp = await searchParams;
  const base = parseDate(sp.week) ?? todayMY();
  const monday = addDays(base, -((base.getUTCDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const [shifts, emps, roster, depts, tenant] = await Promise.all([
    prisma.shift.findMany({ where: { tenantId: ctx.tenantId } }),
    prisma.employee.findMany({ where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROBATION", "NOTICE"] }, ...(sp.dept ? { departmentId: sp.dept } : {}) }, orderBy: { fullName: "asc" }, include: { department: true } }),
    prisma.rosterEntry.findMany({ where: { tenantId: ctx.tenantId, date: { gte: monday, lte: addDays(monday, 6) } }, include: { shift: true } }),
    prisma.department.findMany({ where: { tenantId: ctx.tenantId } }),
    prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } }),
  ]);
  const def = shifts.find((s) => s.code === "OFC");
  const cell = (empId: string, d: Date) => roster.find((r) => r.employeeId === empId && r.date.getTime() === d.getTime());
  const issues = emps.filter((e) => {
    const entries = days.map((d) => ({ date: d, dayType: cell(e.id, d)?.dayType ?? (d.getUTCDay() === tenant.restDay ? "REST" : "WORK") }));
    return weeksWithoutRestDay(entries).length > 0;
  });

  return (
    <>
      <PageHeader
        title="Shifts & roster"
        emoji="🗓️"
        subtitle="Weekly rostering. The Employment Act requires one rest day per week (s.59) and caps normal hours at 45 per week."
        actions={
          <>
            <FormModal trigger="+ Shift" triggerVariant="secondary" title="New shift" action={saveShiftAction}>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name">
                  <Input name="name" required />
                </Field>
                <Field label="Code">
                  <Input name="code" required maxLength={4} />
                </Field>
                <Field label="Start">
                  <Input type="time" name="startTime" defaultValue="09:00" />
                </Field>
                <Field label="End">
                  <Input type="time" name="endTime" defaultValue="18:00" />
                </Field>
                <Field label="Break (min)">
                  <Input type="number" name="breakMinutes" defaultValue="60" />
                </Field>
                <Field label="Colour">
                  <Input type="color" name="color" defaultValue="#5CC8FF" className="p-1" />
                </Field>
              </div>
              <Checkbox name="overnight" label="Overnight shift" />
            </FormModal>
            <FormModal trigger="Assign shifts" title="Assign roster" action={assignAction} wide>
              <div className="grid grid-cols-2 gap-3">
                <Field label="From">
                  <Input type="date" name="from" defaultValue={toISODate(monday)} />
                </Field>
                <Field label="To">
                  <Input type="date" name="to" defaultValue={toISODate(addDays(monday, 4))} />
                </Field>
                <Field label="Day type">
                  <Select name="dayType" options={[{ value: "WORK", label: "Working day" }, { value: "REST", label: "Rest day" }, { value: "OFF", label: "Off day" }]} />
                </Field>
                <Field label="Shift">
                  <Select name="shiftId" options={shifts.map((s) => ({ value: s.id, label: `${s.name} (${s.startTime}–${s.endTime})` }))} />
                </Field>
              </div>
              <p className="text-xs font-bold uppercase">Employees</p>
              <div className="grid max-h-60 grid-cols-2 gap-1 overflow-y-auto rounded-xl border-2 border-ink p-3">
                {emps.map((e) => (
                  <label key={e.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="employeeIds" value={e.id} /> {e.fullName}
                  </label>
                ))}
              </div>
            </FormModal>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {shifts.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full border-2 border-ink px-2.5 py-0.5 text-xs font-bold" style={{ background: s.color }}>
            {s.code} · {s.name} {s.startTime}–{s.endTime}
          </span>
        ))}
      </div>
      {issues.length > 0 && (
        <div className="mb-4">
          <Callout tone="bubblegum" emoji="⚠️">
            {issues.length} employee(s) have no rest day this week: {issues.map((e) => e.preferredName ?? e.fullName).join(", ")}.
          </Callout>
        </div>
      )}
      <Card>
        <CardHeader
          title={`Week of ${fmtDate(monday, "long")}`}
          emoji="📆"
          action={
            <div className="flex items-center gap-2">
              <form className="flex gap-2">
                <input type="hidden" name="week" value={toISODate(monday)} />
                <Select name="dept" defaultValue={sp.dept ?? ""} placeholder="All departments" options={depts.map((d) => ({ value: d.id, label: d.name }))} className="h-8 w-44 text-xs" />
                <button className="rounded-lg border-2 border-ink px-2 text-xs font-bold">Filter</button>
              </form>
              <Link href={`/shifts?week=${toISODate(addDays(monday, -7))}${sp.dept ? `&dept=${sp.dept}` : ""}`} className="rounded-lg border-2 border-ink px-2 py-1 text-xs font-bold">←</Link>
              <Link href={`/shifts?week=${toISODate(addDays(monday, 7))}${sp.dept ? `&dept=${sp.dept}` : ""}`} className="rounded-lg border-2 border-ink px-2 py-1 text-xs font-bold">→</Link>
            </div>
          }
        />
        <div className="overflow-x-auto p-4">
          <table className="w-full min-w-[820px] border-collapse text-xs">
            <thead>
              <tr>
                <th className="w-52 text-left">Employee</th>
                {days.map((d) => (
                  <th key={d.toISOString()} className="border border-soft-line bg-paper-2 py-2">
                    {d.toLocaleDateString("en-MY", { weekday: "short", day: "numeric", timeZone: "UTC" })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {emps.map((e) => (
                <tr key={e.id}>
                  <td className="py-1 pr-2">
                    <span className="flex items-center gap-2">
                      <Avatar name={e.fullName} color={e.avatarColor} size={22} />
                      <span className="truncate font-semibold">{e.fullName}</span>
                    </span>
                  </td>
                  {days.map((d) => {
                    const r = cell(e.id, d);
                    const dow = d.getUTCDay();
                    const dt = r?.dayType ?? (dow === tenant.restDay ? "REST" : dow === tenant.offDay ? "OFF" : "WORK");
                    const sh = r?.shift ?? (dt === "WORK" ? def : null);
                    return (
                      <td key={d.toISOString()} className="h-9 border border-soft-line p-1 text-center">
                        {dt === "WORK" && sh ? (
                          <span className={`block rounded-md border border-ink py-1 font-bold ${r ? "" : "opacity-50"}`} style={{ background: sh.color }} title={`${sh.name} ${sh.startTime}–${sh.endTime}${r ? "" : " (default)"}`}>
                            {sh.code}
                          </span>
                        ) : (
                          <span className="text-muted">{dt === "REST" ? "Rest" : "Off"}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-muted">Faded cells are the default office shift. Solid cells are explicitly rostered.</p>
        </div>
      </Card>
    </>
  );
}
