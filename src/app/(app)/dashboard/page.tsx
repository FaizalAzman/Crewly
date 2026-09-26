import Link from "next/link";
import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { Badge, Card, CardBody, CardHeader, Callout, LinkButton, PageHeader, PersonCell, StatCard } from "@/components/ui";
import { ColumnChart, HBarChart } from "@/components/charts";
import { addDays, fmtDate, parsePeriod, periodLabel, rm, todayMY } from "@/lib/utils";
import { holidayAppliesToState } from "@/lib/calendar";
import { countPendingApprovals } from "@/server/services/approvals.service";
import { approvalScope } from "@/server/services/scope";
import { can } from "@/lib/permissions";
import { setupProgress } from "@/server/services/onboarding.service";
import { Progress } from "@/components/ui";
import { permitAlert } from "@/server/services/relations.service";
import { MONTHS, ACTIVE_STATUSES } from "@/lib/constants";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const ctx = await requireCtx("employee.view");
  const sp = await searchParams;
  const T = ctx.tenantId;
  const today = todayMY();
  const year = today.getUTCFullYear();
  // Scope: company-wide roles see everything; team roles see their reporting line only.
  const team = await approvalScope(ctx);
  const teamIds = team === null ? null : [...team, ...(ctx.employeeId ? [ctx.employeeId] : [])];
  const inTeam = teamIds ? { id: { in: teamIds } } : {};
  const inTeamEmp = teamIds ? { employeeId: { in: teamIds } } : {};
  const seePay = can(ctx, "payroll.manage");
  const seeCompliance = can(ctx, "payroll.manage") || can(ctx, "lifecycle.manage") || can(ctx, "foreign.manage");
  const seeAudit = can(ctx, "audit.view");

  const [employees, onLeaveToday, pending, runs, holidays, permits, probation, audit, attendanceToday, depts, company] = await Promise.all([
    prisma.employee.findMany({
      where: { tenantId: T, status: { in: ACTIVE_STATUSES }, ...inTeam },
      select: { id: true, fullName: true, preferredName: true, dateOfBirth: true, joinDate: true, avatarColor: true, jobTitle: true, departmentId: true, citizenship: true, gender: true, status: true },
    }),
    prisma.leaveRequest.findMany({
      where: { tenantId: T, status: "APPROVED", startDate: { lte: today }, endDate: { gte: today }, ...inTeamEmp },
      include: { employee: { select: { fullName: true, avatarColor: true, jobTitle: true } }, leaveType: true },
    }),
    countPendingApprovals(ctx),
    seePay ? prisma.payrollRun.findMany({ where: { tenantId: T, period: { startsWith: `${year}-` } }, orderBy: { period: "asc" } }) : Promise.resolve([]),
    prisma.publicHoliday.findMany({ where: { date: { gte: today, lte: addDays(today, 60) }, OR: [{ tenantId: null }, { tenantId: T }] }, orderBy: { date: "asc" } }),
    seeCompliance ? prisma.workPermit.findMany({ where: { tenantId: T }, include: { employee: { select: { fullName: true } } } }) : Promise.resolve([]),
    prisma.employee.findMany({ where: { tenantId: T, status: "PROBATION", ...inTeam }, orderBy: { confirmationDate: "asc" }, take: 5 }),
    seeAudit ? prisma.auditLog.findMany({ where: { tenantId: T, action: { not: "LOGIN" } }, orderBy: { createdAt: "desc" }, take: 7 }) : Promise.resolve([]),
    prisma.attendanceRecord.count({ where: { tenantId: T, date: today, clockIn: { not: null }, ...inTeamEmp } }),
    prisma.department.findMany({ where: { tenantId: T } }),
    prisma.company.findFirst({ where: { tenantId: T, isDefault: true } }),
  ]);

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: T } });
  const setup = can(ctx, "settings.manage") && !tenant.onboardedAt ? await setupProgress(T, ctx.userId) : null;
  const upcomingLeave = seePay
    ? []
    : await prisma.leaveRequest.findMany({
        where: { tenantId: T, status: { in: ["APPROVED", "PENDING"] }, startDate: { gt: today, lte: addDays(today, 14) }, ...inTeamEmp },
        include: { employee: { select: { fullName: true, avatarColor: true, jobTitle: true } }, leaveType: true },
        orderBy: { startDate: "asc" },
      });
  const headcount = employees.length;
  const latest = [...runs].reverse().find(Boolean);
  const byPeriod = new Map<string, { net: number; statutory: number; tax: number }>();
  for (const r of runs) {
    const cur = byPeriod.get(r.period) ?? { net: 0, statutory: 0, tax: 0 };
    cur.net += r.totalNet;
    cur.statutory += r.totalEpfER + r.totalEpfEE + r.totalSocsoER + r.totalSocsoEE + r.totalEisER + r.totalEisEE + r.totalHrdf;
    cur.tax += r.totalPcb + r.totalZakat;
    byPeriod.set(r.period, cur);
  }
  const trend = [...byPeriod.entries()].map(([p, v]) => ({ label: MONTHS[parsePeriod(p).month - 1], net: Math.round(v.net), statutory: Math.round(v.statutory), tax: Math.round(v.tax) }));
  const latestPeriod = latest?.period;
  const latestCost = runs.filter((r) => r.period === latestPeriod).reduce((s, r) => s + r.totalEmployerCost, 0);

  const deptData = depts
    .map((d) => ({ name: d.name, value: employees.filter((e) => e.departmentId === d.id).length }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);

  const month = today.getUTCMonth();
  const birthdays = employees
    .filter((e) => e.dateOfBirth && e.dateOfBirth.getUTCMonth() === month)
    .sort((a, b) => a.dateOfBirth!.getUTCDate() - b.dateOfBirth!.getUTCDate());
  const anniversaries = employees
    .filter((e) => e.joinDate.getUTCMonth() === month && e.joinDate.getUTCFullYear() < year)
    .map((e) => ({ ...e, years: year - e.joinDate.getUTCFullYear() }));

  const state = company?.state ?? "SELANGOR";
  const upcomingHolidays = holidays.filter((h) => h.kind === "COMPANY" || holidayAppliesToState(h.states, state)).slice(0, 5);
  const permitIssues = permits.map((p) => ({ ...p, alert: permitAlert(p.expiryDate, today) })).filter((p) => p.alert !== "OK");

  // Statutory deadlines: contributions and PCB for month M are due by the 15th of M+1.
  const due15 = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + (today.getUTCDate() > 15 ? 1 : 0), 15));
  const daysToDue = Math.round((due15.getTime() - today.getTime()) / 86400000);
  const newJoinersNeedingCp22 = employees.filter((e) => (today.getTime() - e.joinDate.getTime()) / 86400000 <= 30);

  return (
    <>
      <PageHeader
        kicker={fmtDate(today, "long")}
        title={`Hello, ${ctx.userName.split(" ")[0]}`}
        emoji="👋"
        subtitle="Here's what's happening across your company today."
        actions={
          <>
            {can(ctx, "employee.manage") && <LinkButton href="/employees/new" variant="secondary">+ Add employee</LinkButton>}
            {seePay && <LinkButton href="/payroll" variant="primary">Run payroll →</LinkButton>}
            {!seePay && <LinkButton href="/approvals" variant="primary">Approvals →</LinkButton>}
          </>
        }
      />

      {setup && (
        <Link href="/welcome" className="press mb-6 block rounded-2xl border-2 border-ink bg-lime p-4 shadow-brutal">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-display text-lg font-extrabold">🚀 Finish setting up your workspace</p>
            <span className="text-sm font-bold">{setup.done}/{setup.total} done · continue →</span>
          </div>
          <Progress value={setup.percent} className="mt-2 bg-card" />
        </Link>
      )}

      {sp.welcome && (
        <div className="mb-6">
          <Callout tone="lime" emoji="🎉">
            <b>Your workspace is ready.</b> Statutory rules, 2026 public holidays, leave types, pay items and templates are preloaded. Start by adding employees.
          </Callout>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={teamIds ? "My team" : "Active headcount"} value={headcount} hint={`${employees.filter((e) => e.status === "PROBATION").length} on probation · ${employees.filter((e) => e.citizenship === "FOREIGNER").length} foreign`} tone="lime" emoji="🧑‍🤝‍🧑" href="/employees" />
        <StatCard label="Out today" value={onLeaveToday.length} hint={`${attendanceToday} clocked in so far`} tone="sky" emoji="🌴" href="/leave?tab=calendar" />
        <StatCard label="Pending approvals" value={pending} hint="Leave, claims, OT, loans & pay" tone="bubblegum" emoji="✅" href="/approvals" />
        {seePay ? (
          <StatCard label={latestPeriod ? `Employer cost · ${periodLabel(latestPeriod)}` : "Employer cost"} value={rm(latestCost, { decimals: 0 })} hint={latest ? `Latest run: ${latest.status.toLowerCase()}` : "No payroll yet"} tone="sunny" emoji="💸" href="/payroll" />
        ) : (
          <StatCard label="Leave in next 14 days" value={upcomingLeave.length} hint="Approved + pending" tone="sunny" emoji="🗓️" href="/leave?tab=calendar" />
        )}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {seePay ? (
        <Card className="xl:col-span-2">
          <CardHeader title="Payroll cost this year" subtitle="Net pay, statutory contributions (EPF, SOCSO, EIS, HRD Corp) and tax (PCB + zakat), all entities" emoji="📈" />
          <CardBody>
            {trend.length ? (
              <ColumnChart
                data={trend}
                money
                series={[
                  { key: "net", label: "Net pay" },
                  { key: "statutory", label: "Statutory" },
                  { key: "tax", label: "PCB & zakat" },
                ]}
              />
            ) : (
              <p className="text-sm text-muted">Run your first payroll to see trends.</p>
            )}
          </CardBody>
        </Card>
        ) : (
          <Card className="xl:col-span-2">
            <CardHeader title="Team leave, next 14 days" emoji="🗓️" subtitle="Plan cover before it hits" />
            <CardBody className="space-y-3">
              {upcomingLeave.length === 0 && <p className="text-sm text-muted">No leave coming up.</p>}
              {upcomingLeave.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2">
                  <PersonCell name={l.employee.fullName} sub={`${l.leaveType.emoji} ${l.leaveType.name} · ${l.days} day(s)`} color={l.employee.avatarColor} />
                  <span className="text-xs font-semibold">
                    {fmtDate(l.startDate)} – {fmtDate(l.endDate)} {l.status === "PENDING" && <Badge tone="yellow">pending</Badge>}
                  </span>
                </div>
              ))}
            </CardBody>
          </Card>
        )}
        <Card>
          <CardHeader title="Headcount by department" emoji="🏢" />
          <CardBody>
            <HBarChart data={deptData} height={Math.max(200, deptData.length * 30)} />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {seeCompliance ? (
        <Card>
          <CardHeader title="Compliance radar" subtitle="Deadlines and things that need attention" emoji="🛡️" />
          <CardBody className="space-y-3">
            <DeadlineRow label="EPF, SOCSO, EIS & PCB (CP39) payment" when={`${fmtDate(due15, "long")}`} days={daysToDue} />
            <DeadlineRow label="HRD Corp levy" when={`${fmtDate(due15, "long")}`} days={daysToDue} />
            {newJoinersNeedingCp22.length > 0 && (
              <DeadlineRow label={`CP22 for ${newJoinersNeedingCp22.length} new joiner(s)`} when="Within 30 days of hire" days={null} href="/onboarding" />
            )}
            <DeadlineRow label={`Form EA to employees (${year})`} when={`28 Feb ${year + 1}`} days={Math.round((Date.UTC(year + 1, 1, 28) - today.getTime()) / 86400000)} href="/tax" />
            {permitIssues.map((p) => (
              <Link key={p.id} href="/foreign-workers" className="flex items-center justify-between rounded-xl border-2 border-ink bg-paper px-3 py-2 text-sm hover:bg-paper-2">
                <span>
                  🌏 {p.employee.fullName} · {p.permitType}
                </span>
                <Badge tone={p.alert === "EXPIRED" ? "red" : p.alert === "CRITICAL" ? "orange" : "yellow"}>{p.alert === "EXPIRED" ? "Expired" : `Expires ${fmtDate(p.expiryDate)}`}</Badge>
              </Link>
            ))}
          </CardBody>
        </Card>
        ) : (
          <Card>
            <CardHeader title="Your team" emoji="🧑‍🤝‍🧑" action={<Link href="/employees" className="text-xs font-bold underline">All</Link>} />
            <CardBody className="space-y-2.5">
              {employees.filter((e) => e.id !== ctx.employeeId).slice(0, 8).map((e) => (
                <PersonCell key={e.id} name={e.fullName} sub={e.jobTitle} color={e.avatarColor} href={`/employees/${e.id}`} />
              ))}
              {employees.length <= 1 && <p className="text-sm text-muted">No direct reports yet.</p>}
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title="Who's out today" emoji="🏖️" action={<Link href="/leave?tab=calendar" className="text-xs font-bold underline">Calendar</Link>} />
          <CardBody className="space-y-3">
            {onLeaveToday.length === 0 && <p className="text-sm text-muted">Everyone&apos;s in today.</p>}
            {onLeaveToday.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2">
                <PersonCell name={l.employee.fullName} sub={l.employee.jobTitle} color={l.employee.avatarColor} />
                <Badge tone="blue">
                  {l.leaveType.emoji} {l.leaveType.code}
                </Badge>
              </div>
            ))}
            <div className="border-t-2 border-dashed border-soft-line pt-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Upcoming holidays ({state.replace(/_/g, " ").toLowerCase()})</p>
              {upcomingHolidays.map((h) => (
                <div key={h.id} className="flex justify-between py-1 text-sm">
                  <span>{h.name}</span>
                  <span className="font-mono text-xs text-muted">{fmtDate(h.date)}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Celebrations" emoji="🎂" subtitle={`${MONTHS[month]} birthdays & work anniversaries`} />
          <CardBody className="space-y-2.5">
            {birthdays.length === 0 && anniversaries.length === 0 && <p className="text-sm text-muted">Nothing this month.</p>}
            {birthdays.map((e) => (
              <div key={e.id} className="flex items-center justify-between">
                <PersonCell name={e.fullName} sub={e.jobTitle} color={e.avatarColor} />
                <span className="text-xs font-bold">🎂 {e.dateOfBirth!.getUTCDate()} {MONTHS[month]}</span>
              </div>
            ))}
            {anniversaries.map((e) => (
              <div key={e.id} className="flex items-center justify-between">
                <PersonCell name={e.fullName} sub={e.jobTitle} color={e.avatarColor} />
                <Badge tone="purple">🏅 {e.years} yr{e.years > 1 ? "s" : ""}</Badge>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Probation ending soon" emoji="⏳" action={<Link href="/employees?status=PROBATION" className="text-xs font-bold underline">All</Link>} />
          <CardBody className="space-y-3">
            {probation.length === 0 && <p className="text-sm text-muted">No one on probation.</p>}
            {probation.map((e) => {
              const days = e.confirmationDate ? Math.round((e.confirmationDate.getTime() - today.getTime()) / 86400000) : null;
              return (
                <div key={e.id} className="flex items-center justify-between">
                  <PersonCell name={e.fullName} sub={e.jobTitle} color={e.avatarColor} href={`/employees/${e.id}`} />
                  <Badge tone={days !== null && days < 0 ? "red" : days !== null && days <= 14 ? "orange" : "yellow"}>
                    {days === null ? "No date" : days < 0 ? `Overdue ${-days}d` : `Confirm in ${days}d`}
                  </Badge>
                </div>
              );
            })}
          </CardBody>
        </Card>
        {seeAudit && (
        <Card>
          <CardHeader title="Recent activity" emoji="⚡" action={<Link href="/settings?tab=audit" className="text-xs font-bold underline">Audit log</Link>} />
          <CardBody className="space-y-2.5">
            {audit.map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-3 text-sm">
                <span>
                  <b>{a.userName}</b> <span className="text-ink-2">{a.summary}</span>
                </span>
                <span className="shrink-0 font-mono text-[11px] text-muted">{fmtDate(a.createdAt)}</span>
              </div>
            ))}
          </CardBody>
        </Card>
        )}
      </div>
    </>
  );
}

function DeadlineRow({ label, when, days, href }: { label: string; when: string; days: number | null; href?: string }) {
  const inner = (
    <div className="flex items-center justify-between rounded-xl border-2 border-ink bg-paper px-3 py-2 text-sm hover:bg-paper-2">
      <span>
        <span className="font-semibold">{label}</span>
        <span className="block text-xs text-muted">{when}</span>
      </span>
      {days !== null && <Badge tone={days <= 3 ? "red" : days <= 7 ? "orange" : "gray"}>{days}d</Badge>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : <Link href="/statutory">{inner}</Link>;
}
