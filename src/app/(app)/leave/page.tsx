import Link from "next/link";
import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { Avatar, Badge, Callout, Card, CardHeader, Checkbox, EmptyState, Field, Input, PageHeader, PersonCell, Select, StatCard, StatusBadge, Table, Tabs, TD, TH, THead, TR } from "@/components/ui";
import { FormModal } from "@/components/forms";
import { DecideButtons } from "@/components/decide-buttons";
import { ApplyLeaveButton } from "@/components/request-forms";
import { available } from "@/server/services/leave.service";
import { addDays, fmtDate, parsePeriod, periodOf, shiftPeriod, todayMY, toISODate } from "@/lib/utils";
import { holidayAppliesToState } from "@/lib/calendar";
import { humanize, MONTHS } from "@/lib/constants";
import { scopedEmployeeWhere } from "@/server/services/scope";
import { Attachment } from "@/components/attachment";
import { adjustBalanceAction, carryForwardAction, creditRlAction, recalcEntitlementsAction, saveLeaveTypeAction } from "./actions";

export const metadata: Metadata = { title: "Leave" };

export default async function LeavePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireCtx("leave.approve");
  const sp = await searchParams;
  const tab = sp.tab ?? "requests";
  const manage = can(ctx, "leave.manage");
  const year = todayMY().getUTCFullYear();
  const scope = await scopedEmployeeWhere(ctx);
  const [pendingCount, onLeaveToday, types] = await Promise.all([
    prisma.leaveRequest.count({ where: { tenantId: ctx.tenantId, status: "PENDING", ...scope } }),
    prisma.leaveRequest.count({ where: { tenantId: ctx.tenantId, status: "APPROVED", startDate: { lte: todayMY() }, endDate: { gte: todayMY() } } }),
    prisma.leaveType.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { name: "asc" } }),
  ]);
  const takenYtd = await prisma.leaveRequest.aggregate({ where: { tenantId: ctx.tenantId, status: "APPROVED", startDate: { gte: new Date(Date.UTC(year, 0, 1)) } }, _sum: { days: true } });
  const empOpts = (await prisma.employee.findMany({ where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROBATION", "NOTICE"] } }, orderBy: { fullName: "asc" } })).map((e) => ({ value: e.id, label: e.fullName }));

  return (
    <>
      <PageHeader
        title="Leave"
        emoji="🌴"
        subtitle="Employment Act 1955 entitlements, state public holidays, half days, carry-forward and replacement leave."
        actions={
          manage && (
            <>
              <FormModal trigger="🔁 Credit replacement leave" triggerVariant="secondary" title="Credit replacement leave" subtitle="For work on rest days or public holidays in lieu of OT pay" action={creditRlAction}>
                <Field label="Employee">
                  <Select name="employeeId" options={empOpts} />
                </Field>
                <Field label="Days">
                  <Input type="number" step="0.5" name="days" defaultValue="1" />
                </Field>
                <Field label="Reason">
                  <Input name="reason" required placeholder="Worked on Malaysia Day (16 Sep)" />
                </Field>
              </FormModal>
              <ApplyLeaveButton tenantId={ctx.tenantId} onBehalf btn={{ label: "+ Leave on behalf", variant: "primary" }} />
            </>
          )
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Pending" value={pendingCount} tone="sunny" emoji="⏳" href="/approvals" />
        <StatCard label="Out today" value={onLeaveToday} tone="sky" emoji="🏖️" />
        <StatCard label={`Days taken ${year}`} value={takenYtd._sum.days ?? 0} tone="lime" emoji="📆" />
        <StatCard label="Leave types" value={types.filter((t) => t.active).length} tone="white" emoji="🗂️" />
      </div>
      <Tabs
        active={tab}
        tabs={[
          { key: "requests", label: "Requests", href: "/leave?tab=requests", count: pendingCount },
          { key: "calendar", label: "Team calendar", href: "/leave?tab=calendar" },
          { key: "balances", label: "Balances", href: "/leave?tab=balances" },
          ...(manage ? [{ key: "types", label: "Leave types & policy", href: "/leave?tab=types" }] : []),
        ]}
      />
      {tab === "requests" && <Requests ctx={ctx} status={sp.status ?? "PENDING"} />}
      {tab === "calendar" && <CalendarView tenantId={ctx.tenantId} period={sp.month ?? periodOf(todayMY())} />}
      {tab === "balances" && <Balances tenantId={ctx.tenantId} year={year} manage={manage} types={types} empOpts={empOpts} />}
      {tab === "types" && manage && <Types types={types} />}
    </>
  );
}

async function Requests({ ctx, status }: { ctx: Awaited<ReturnType<typeof requireCtx>>; status: string }) {
  const scope = await scopedEmployeeWhere(ctx);
  const requests = await prisma.leaveRequest.findMany({
    where: { tenantId: ctx.tenantId, ...(status !== "ALL" ? { status } : {}), ...scope },
    include: { employee: { include: { department: true } }, leaveType: true },
    orderBy: status === "PENDING" ? { createdAt: "asc" } : { startDate: "desc" },
    take: 100,
  });
  return (
    <Card>
      <div className="flex flex-wrap gap-2 border-b-2 border-ink p-3">
        {["PENDING", "APPROVED", "REJECTED", "CANCELLED", "ALL"].map((s) => (
          <Link key={s} href={`/leave?tab=requests&status=${s}`} className={`rounded-full border-2 border-ink px-3 py-1 text-xs font-bold ${status === s ? "bg-ink text-paper" : "bg-card"}`}>
            {humanize(s)}
          </Link>
        ))}
      </div>
      {requests.length === 0 ? (
        <EmptyState emoji="🌤️" title="Nothing here" />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Employee</TH>
              <TH>Type</TH>
              <TH>Dates</TH>
              <TH>Days</TH>
              <TH>Reason</TH>
              <TH>Status</TH>
              <TH />
            </tr>
          </THead>
          <tbody>
            {requests.map((r) => (
              <TR key={r.id}>
                <TD>
                  <PersonCell name={r.employee.fullName} sub={r.employee.department?.name} color={r.employee.avatarColor} href={`/employees/${r.employeeId}?tab=leave`} />
                </TD>
                <TD>
                  {r.leaveType.emoji} {r.leaveType.name}
                </TD>
                <TD className="text-xs">
                  {fmtDate(r.startDate)} – {fmtDate(r.endDate)} {r.halfDay && `(${r.halfDay})`}
                </TD>
                <TD className="font-bold">{r.days}</TD>
                <TD className="max-w-xs text-xs">
                  {r.reason}
                  {r.approverNote && <span className="block text-muted">↳ {r.approverNote}</span>}
                  {r.attachment && <span className="block"><Attachment value={r.attachment} label="Supporting document" /></span>}
                </TD>
                <TD>
                  <StatusBadge status={r.status} />
                </TD>
                <TD>{r.status === "PENDING" && <DecideButtons kind="leave" id={r.id} />}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

async function CalendarView({ tenantId, period }: { tenantId: string; period: string }) {
  const { start, end, daysInMonth, month, year } = parsePeriod(period);
  const [leaves, holidays, company, tenant] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { tenantId, status: { in: ["APPROVED", "PENDING"] }, startDate: { lte: end }, endDate: { gte: start } },
      include: { employee: true, leaveType: true },
      orderBy: { employee: { fullName: "asc" } },
    }),
    prisma.publicHoliday.findMany({ where: { date: { gte: start, lte: end }, OR: [{ tenantId: null }, { tenantId }] } }),
    prisma.company.findFirst({ where: { tenantId, isDefault: true } }),
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
  ]);
  const state = company?.state ?? "SELANGOR";
  const hol = new Map(holidays.filter((h) => h.kind === "COMPANY" || holidayAppliesToState(h.states, state)).map((h) => [toISODate(h.date), h.name]));
  const people = [...new Map(leaves.map((l) => [l.employeeId, l.employee])).values()];
  const days = Array.from({ length: daysInMonth }, (_, i) => addDays(start, i));
  return (
    <Card>
      <CardHeader
        title={`${MONTHS[month - 1]} ${year}`}
        emoji="📅"
        subtitle={`Public holidays shown for ${state.replace(/_/g, " ").toLowerCase()} · striped = pending`}
        action={
          <div className="flex gap-2">
            <Link href={`/leave?tab=calendar&month=${shiftPeriod(period, -1)}`} className="rounded-lg border-2 border-ink px-2 py-1 text-xs font-bold">←</Link>
            <Link href={`/leave?tab=calendar&month=${shiftPeriod(period, 1)}`} className="rounded-lg border-2 border-ink px-2 py-1 text-xs font-bold">→</Link>
          </div>
        }
      />
      <div className="overflow-x-auto p-4">
        <table className="w-full min-w-[900px] border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-44 bg-card text-left font-bold">Employee</th>
              {days.map((d) => {
                const dow = d.getUTCDay();
                const weekend = dow === tenant.restDay || dow === tenant.offDay;
                const h = hol.get(toISODate(d));
                return (
                  <th key={d.toISOString()} title={h} className={`w-7 border border-soft-line py-1 text-center font-mono ${h ? "bg-bubblegum" : weekend ? "bg-paper-2" : ""}`}>
                    <div>{"SMTWTFS"[dow]}</div>
                    <div className="font-bold">{d.getUTCDate()}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {people.length === 0 && (
              <tr>
                <td colSpan={daysInMonth + 1} className="py-8 text-center text-muted">
                  No leave this month.
                </td>
              </tr>
            )}
            {people.map((p) => (
              <tr key={p.id}>
                <td className="sticky left-0 z-10 bg-card py-1 pr-2">
                  <span className="flex items-center gap-1.5">
                    <Avatar name={p.fullName} color={p.avatarColor} size={20} />
                    <span className="truncate font-semibold">{p.preferredName ?? p.fullName}</span>
                  </span>
                </td>
                {days.map((d) => {
                  const l = leaves.find((x) => x.employeeId === p.id && x.startDate <= d && x.endDate >= d);
                  const dow = d.getUTCDay();
                  const weekend = dow === tenant.restDay || dow === tenant.offDay;
                  const h = hol.get(toISODate(d));
                  return (
                    <td key={d.toISOString()} className={`h-7 border border-soft-line text-center ${h ? "bg-bubblegum/40" : weekend ? "bg-paper-2" : ""}`} title={l ? `${l.leaveType.name} (${l.status.toLowerCase()})` : h}>
                      {l && !weekend && !h && (
                        <span
                          className="mx-auto block h-5 w-5 rounded-md border border-ink text-[10px] leading-5"
                          style={{ background: l.status === "PENDING" ? `repeating-linear-gradient(45deg, ${l.leaveType.color}, ${l.leaveType.color} 3px, #fff 3px, #fff 6px)` : l.leaveType.color }}
                        >
                          {l.leaveType.code[0]}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {hol.size > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {[...hol.entries()].map(([d, n]) => (
              <Badge key={d} tone="pink">
                🎉 {fmtDate(new Date(d))} · {n}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

async function Balances({ tenantId, year, manage, types, empOpts }: { tenantId: string; year: number; manage: boolean; types: { id: string; code: string; name: string; emoji: string }[]; empOpts: { value: string; label: string }[] }) {
  const codes = ["AL", "SL", "HL", "RL", "PL", "ML"];
  const shown = types.filter((t) => codes.includes(t.code));
  const emps = await prisma.employee.findMany({
    where: { tenantId, status: { in: ["ACTIVE", "PROBATION", "NOTICE"] } },
    include: { leaveBalances: { where: { year } }, department: true },
    orderBy: { fullName: "asc" },
  });
  return (
    <>
      {manage && (
        <div className="mb-4 flex flex-wrap gap-2">
          <FormModal trigger="Adjust a balance" triggerVariant="secondary" title="Adjust leave balance" action={adjustBalanceAction}>
            <Field label="Employee">
              <Select name="employeeId" options={empOpts} />
            </Field>
            <Field label="Leave type">
              <Select name="leaveTypeId" options={types.map((t) => ({ value: t.id, label: `${t.emoji} ${t.name}` }))} />
            </Field>
            <input type="hidden" name="year" value={year} />
            <Field label="Days (+/−)">
              <Input type="number" step="0.5" name="delta" defaultValue="1" />
            </Field>
            <Field label="Reason (audited)">
              <Input name="reason" required />
            </Field>
          </FormModal>
          <FormModal trigger="Recalculate entitlements" triggerVariant="secondary" title="Recalculate entitlements" subtitle="Re-applies EA 1955 service-based entitlements and pro-rating to all current staff." action={recalcEntitlementsAction} submitLabel="Recalculate">
            <input type="hidden" name="year" value={year} />
            <Callout emoji="ℹ️">Taken, pending, carried-forward and adjustments are kept; only entitlements are refreshed.</Callout>
          </FormModal>
          <FormModal trigger={`Year-end carry forward ${year} → ${year + 1}`} triggerVariant="grape" title="Carry forward unused leave" action={carryForwardAction} submitLabel="Carry forward">
            <input type="hidden" name="year" value={year} />
            <Callout emoji="🔁">Unused days up to each leave type&apos;s carry-forward limit move into {year + 1}.</Callout>
          </FormModal>
        </div>
      )}
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Employee</TH>
              {shown.map((t) => (
                <TH key={t.id} className="text-center">
                  {t.emoji} {t.code}
                </TH>
              ))}
            </tr>
          </THead>
          <tbody>
            {emps.map((e) => (
              <TR key={e.id}>
                <TD>
                  <PersonCell name={e.fullName} sub={e.department?.name} color={e.avatarColor} href={`/employees/${e.id}?tab=leave`} />
                </TD>
                {shown.map((t) => {
                  const b = e.leaveBalances.find((x) => x.leaveTypeId === t.id);
                  if (!b || b.entitled + b.adjustment + b.carriedForward === 0) return <TD key={t.id} className="text-center text-muted">–</TD>;
                  const avail = available(b);
                  return (
                    <TD key={t.id} className="text-center">
                      <span className="font-mono font-bold">{avail}</span>
                      <span className="text-xs text-muted">/{b.entitled + b.carriedForward + b.adjustment}</span>
                    </TD>
                  );
                })}
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}

function Types({ types }: { types: Awaited<ReturnType<typeof prisma.leaveType.findMany>> }) {
  const form = (t?: (typeof types)[number]) => (
    <>
      {t && <input type="hidden" name="id" value={t.id} />}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Code">
          <Input name="code" defaultValue={t?.code} disabled={!!t} required />
        </Field>
        <Field label="Emoji">
          <Input name="emoji" defaultValue={t?.emoji ?? "🌴"} />
        </Field>
        <Field label="Colour">
          <Input type="color" name="color" defaultValue={t?.color ?? "#C6F432"} className="p-1" />
        </Field>
      </div>
      <Field label="Name">
        <Input name="name" defaultValue={t?.name} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Entitlement rule">
          <Select name="entitlementRule" defaultValue={t?.entitlementRule ?? "FIXED"} options={[{ value: "EA_ANNUAL", label: "EA s.60E annual (8/12/16)" }, { value: "EA_SICK", label: "EA s.60F sick (14/18/22)" }, { value: "FIXED", label: "Fixed days" }, { value: "NONE", label: "No entitlement" }]} />
        </Field>
        <Field label="Fixed days">
          <Input type="number" step="0.5" name="defaultDays" defaultValue={t?.defaultDays ?? 0} />
        </Field>
        <Field label="Max carry forward">
          <Input type="number" step="0.5" name="carryForwardMax" defaultValue={t?.carryForwardMax ?? 0} />
        </Field>
        <Field label="Min notice (days)">
          <Input type="number" name="minNoticeDays" defaultValue={t?.minNoticeDays ?? 0} />
        </Field>
        <Field label="Gender restriction">
          <Select name="gender" defaultValue={t?.gender ?? ""} placeholder="Anyone" options={["MALE", "FEMALE"]} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Checkbox name="paid" label="Paid leave" defaultChecked={t?.paid ?? true} />
        <Checkbox name="allowHalfDay" label="Allow half days" defaultChecked={t?.allowHalfDay ?? true} />
        <Checkbox name="requiresAttachment" label="Requires document" defaultChecked={t?.requiresAttachment ?? false} />
        <Checkbox name="countsWorkingDaysOnly" label="Count working days only" defaultChecked={t?.countsWorkingDaysOnly ?? true} />
        <Checkbox name="active" label="Active" defaultChecked={t?.active ?? true} />
      </div>
    </>
  );
  return (
    <Card>
      <CardHeader title="Leave types" emoji="🗂️" subtitle="Statutory types are locked to at least the legal minimum." action={<FormModal trigger="+ New type" triggerSize="sm" title="New leave type" action={saveLeaveTypeAction}>{form()}</FormModal>} />
      <Table>
        <THead>
          <tr>
            <TH>Type</TH>
            <TH>Rule</TH>
            <TH>Days</TH>
            <TH>C/F</TH>
            <TH>Flags</TH>
            <TH />
          </tr>
        </THead>
        <tbody>
          {types.map((t) => (
            <TR key={t.id}>
              <TD>
                <span className="inline-flex items-center gap-2 font-semibold">
                  <span className="h-3 w-3 rounded-full border border-ink" style={{ background: t.color }} /> {t.emoji} {t.name} <span className="font-mono text-xs text-muted">{t.code}</span>
                </span>
              </TD>
              <TD className="text-xs">{humanize(t.entitlementRule)}</TD>
              <TD>{t.entitlementRule === "FIXED" ? t.defaultDays : t.entitlementRule === "NONE" ? "–" : "By service"}</TD>
              <TD>{t.carryForwardMax || "–"}</TD>
              <TD className="space-x-1">
                {t.statutory && <Badge tone="purple">Statutory</Badge>}
                {!t.paid && <Badge tone="red">Unpaid</Badge>}
                {t.gender && <Badge tone="blue">{humanize(t.gender)} only</Badge>}
                {t.requiresAttachment && <Badge tone="gray">📎 Doc</Badge>}
                {!t.active && <Badge tone="gray">Inactive</Badge>}
              </TD>
              <TD className="text-right">
                <FormModal trigger="Edit" triggerSize="sm" triggerVariant="secondary" title={`Edit ${t.name}`} action={saveLeaveTypeAction}>
                  {form(t)}
                </FormModal>
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
