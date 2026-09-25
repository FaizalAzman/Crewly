import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { Card, CardBody, CardHeader, Money, PageHeader, StatCard, Table, TD, TH, THead, TR } from "@/components/ui";
import { ColumnChart, DistributionChart, HBarChart, TrendChart } from "@/components/charts";
import { ageBand, countBy, headcountOn, leaversBetween, tenureBand, turnoverRate } from "@/lib/analytics";
import { ageOn, rm, todayMY, utcDate } from "@/lib/utils";
import { humanize, MONTHS, ACTIVE_STATUSES } from "@/lib/constants";
import { serviceYears } from "@/lib/statutory/employment-act";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const ctx = await requireCtx("reports.view");
  const today = todayMY();
  const year = today.getUTCFullYear();
  const [people, depts, runs, leaveTaken, attendance, slips] = await Promise.all([
    prisma.employee.findMany({ where: { tenantId: ctx.tenantId }, include: { department: true } }),
    prisma.department.findMany({ where: { tenantId: ctx.tenantId } }),
    prisma.payrollRun.findMany({ where: { tenantId: ctx.tenantId, period: { startsWith: `${year}-` } } }),
    prisma.leaveRequest.findMany({ where: { tenantId: ctx.tenantId, status: "APPROVED", startDate: { gte: utcDate(year, 0, 1) } }, include: { leaveType: true } }),
    prisma.attendanceRecord.findMany({ where: { tenantId: ctx.tenantId, date: { gte: new Date(today.getTime() - 30 * 86400000) }, clockIn: { not: null } } }),
    prisma.payslip.findMany({ where: { tenantId: ctx.tenantId, period: { startsWith: `${year}-` } }, include: { employee: { select: { departmentId: true } } } }),
  ]);
  const current = people.filter((p) => ACTIVE_STATUSES.includes(p.status));
  const months = Array.from({ length: today.getUTCMonth() + 1 }, (_, m) => m);
  const hcTrend = months.map((m) => ({ label: MONTHS[m], headcount: headcountOn(people, utcDate(year, m + 1, 0)) }));
  const startHc = headcountOn(people, utcDate(year - 1, 11, 31));
  const leavers = leaversBetween(people, utcDate(year, 0, 1), today);
  const hires = people.filter((p) => p.joinDate >= utcDate(year, 0, 1)).length;
  const turnover = turnoverRate(leavers, startHc, current.length, today.getUTCMonth() + 1);

  const gender = countBy(current, (p) => humanize(p.gender));
  const race = countBy(current, (p) => humanize(p.race));
  const ages = countBy(current, (p) => ageBand(ageOn(p.dateOfBirth, today)));
  const tenure = countBy(current, (p) => tenureBand(serviceYears(p.joinDate, today)));
  const nat = countBy(current, (p) => (p.citizenship === "CITIZEN" ? "Malaysian" : p.citizenship === "PR" ? "PR" : "Foreign"));
  const order = (obj: Record<string, number>, keys: string[]) => keys.map((k) => ({ name: k, value: obj[k] ?? 0 }));

  const costByDept = depts
    .map((d) => ({ name: d.name, value: Math.round(slips.filter((s) => s.employee.departmentId === d.id).reduce((a, s) => a + s.employerCost, 0)) }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
  const leaveByType = Object.entries(leaveTaken.reduce<Record<string, number>>((a, l) => ({ ...a, [l.leaveType.name]: (a[l.leaveType.name] ?? 0) + l.days }), {}))
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  const lateRate = attendance.length ? Math.round((attendance.filter((a) => a.lateMinutes > 0).length / attendance.length) * 100) : 0;
  const payTrend = [...new Set(runs.map((r) => r.period))].sort().map((p) => {
    const rs = runs.filter((r) => r.period === p);
    return { label: MONTHS[+p.slice(5) - 1], gross: Math.round(rs.reduce((s, r) => s + r.totalGross, 0)), statutory: Math.round(rs.reduce((s, r) => s + r.totalEpfER + r.totalSocsoER + r.totalEisER + r.totalHrdf, 0)) };
  });
  const deptTable = depts.map((d) => {
    const ps = current.filter((p) => p.departmentId === d.id);
    return { d, n: ps.length, avg: ps.length ? ps.reduce((s, p) => s + p.basicSalary, 0) / ps.length : 0, female: ps.filter((p) => p.gender === "FEMALE").length };
  }).filter((r) => r.n > 0);

  return (
    <>
      <PageHeader title="Reports & analytics" emoji="📊" subtitle={`Workforce, cost and time insights · ${year} year to date`} />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatCard label="Headcount" value={current.length} tone="lime" emoji="🧑‍🤝‍🧑" />
        <StatCard label={`Hires ${year}`} value={hires} tone="sky" emoji="🧲" />
        <StatCard label={`Leavers ${year}`} value={leavers} tone="bubblegum" emoji="👋" />
        <StatCard label="Turnover (annualised)" value={`${turnover}%`} tone="sunny" emoji="🔁" />
        <StatCard label="Late arrivals (30d)" value={`${lateRate}%`} tone="white" emoji="⏰" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Headcount trend" emoji="📈" subtitle="End-of-month headcount" />
          <CardBody><TrendChart data={hcTrend} series={[{ key: "headcount", label: "Headcount" }]} height={230} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Payroll cost trend" emoji="💸" subtitle="Gross pay vs employer statutory (EPF, SOCSO, EIS, HRD Corp)" />
          <CardBody><ColumnChart money data={payTrend} series={[{ key: "gross", label: "Gross pay" }, { key: "statutory", label: "Employer statutory" }]} height={230} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Employer cost by department (YTD)" emoji="🏢" />
          <CardBody><HBarChart money data={costByDept} height={Math.max(220, costByDept.length * 30)} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Leave taken by type (YTD)" emoji="🌴" subtitle="Approved days" />
          <CardBody><HBarChart data={leaveByType} height={Math.max(200, leaveByType.length * 30)} /></CardBody>
        </Card>
      </div>
      <h2 className="font-display mb-4 mt-8 text-2xl font-extrabold">Workforce diversity</h2>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Card><CardHeader title="Age" emoji="🎂" /><CardBody><DistributionChart data={order(ages, ["< 25", "25–34", "35–44", "45–54", "55+"])} /></CardBody></Card>
        <Card><CardHeader title="Tenure" emoji="🏅" /><CardBody><DistributionChart data={order(tenure, ["< 1 yr", "1–2 yrs", "2–5 yrs", "5–10 yrs", "10+ yrs"])} /></CardBody></Card>
        <Card><CardHeader title="Race" emoji="🇲🇾" /><CardBody><HBarChart data={Object.entries(race).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)} height={220} /></CardBody></Card>
        <Card><CardHeader title="Gender" emoji="⚧️" /><CardBody><DistributionChart data={Object.entries(gender).map(([name, value]) => ({ name, value }))} height={200} /></CardBody></Card>
        <Card><CardHeader title="Nationality" emoji="🌏" /><CardBody><DistributionChart data={Object.entries(nat).map(([name, value]) => ({ name, value }))} height={200} /></CardBody></Card>
        <Card>
          <CardHeader title="By department" emoji="🧩" />
          <Table>
            <THead><tr><TH>Dept</TH><TH className="text-right">People</TH><TH className="text-right">% F</TH><TH className="text-right">Avg basic</TH></tr></THead>
            <tbody>
              {deptTable.map((r) => (
                <TR key={r.d.id}>
                  <TD className="text-xs font-semibold">{r.d.name}</TD>
                  <TD className="text-right">{r.n}</TD>
                  <TD className="text-right">{Math.round((r.female / r.n) * 100)}%</TD>
                  <TD className="text-right"><Money value={r.avg} /></TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
      <p className="mt-6 text-xs text-muted">Every chart is backed by the tables in its module. Export raw data from Employees (CSV) and Payroll (statutory files). Payroll cost YTD: {rm(runs.reduce((s, r) => s + r.totalEmployerCost, 0), { decimals: 0 })}.</p>
    </>
  );
}
