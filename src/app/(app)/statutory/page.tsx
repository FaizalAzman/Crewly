import type { Metadata } from "next";
import { Download } from "lucide-react";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { Callout, Card, CardBody, CardHeader, Money, PageHeader, Select, StatCard, StatusBadge, Table, TD, TH, THead, TR, btnClass } from "@/components/ui";
import { ColumnChart } from "@/components/charts";
import { periodLabel, rm, shiftPeriod } from "@/lib/utils";
import { MONTHS } from "@/lib/constants";
import { hrdLevyBalance } from "@/server/services/talent.service";

export const metadata: Metadata = { title: "EPF · SOCSO · EIS" };

export default async function StatutoryPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const ctx = await requireCtx("payroll.manage");
  const year = (await searchParams).year ?? String(new Date().getFullYear());
  const runs = await prisma.payrollRun.findMany({ where: { tenantId: ctx.tenantId, period: { startsWith: `${year}-` } }, include: { company: true }, orderBy: [{ period: "desc" }] });
  const s = (k: "totalEpfEE" | "totalEpfER" | "totalSocsoEE" | "totalSocsoER" | "totalEisEE" | "totalEisER" | "totalPcb" | "totalZakat" | "totalHrdf") => runs.reduce((a, r) => a + r[k], 0);
  const hrd = await hrdLevyBalance(ctx.tenantId, Number(year));
  const byMonth = new Map<string, { epf: number; socsoEis: number; pcb: number }>();
  for (const r of runs) {
    const c = byMonth.get(r.period) ?? { epf: 0, socsoEis: 0, pcb: 0 };
    c.epf += r.totalEpfEE + r.totalEpfER;
    c.socsoEis += r.totalSocsoEE + r.totalSocsoER + r.totalEisEE + r.totalEisER;
    c.pcb += r.totalPcb;
    byMonth.set(r.period, c);
  }
  const chart = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([p, v]) => ({ label: MONTHS[+p.slice(5) - 1], epf: Math.round(v.epf), socsoEis: Math.round(v.socsoEis), pcb: Math.round(v.pcb) }));

  return (
    <>
      <PageHeader
        title="EPF · SOCSO · EIS · HRD Corp"
        emoji="🏛️"
        subtitle="Monthly statutory contributions by entity, with submission files. All are due by the 15th of the following month."
        actions={
          <form>
            <Select name="year" defaultValue={year} options={["2025", "2026"]} className="w-28" />
            <button className={`${btnClass("secondary")} ml-2`}>Go</button>
          </form>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label={`EPF ${year}`} value={rm(s("totalEpfEE") + s("totalEpfER"), { decimals: 0 })} hint={`EE ${rm(s("totalEpfEE"), { decimals: 0 })} · ER ${rm(s("totalEpfER"), { decimals: 0 })}`} tone="lime" emoji="🏦" />
        <StatCard label="SOCSO" value={rm(s("totalSocsoEE") + s("totalSocsoER"), { decimals: 0 })} tone="sky" emoji="🛡️" />
        <StatCard label="EIS" value={rm(s("totalEisEE") + s("totalEisER"), { decimals: 0 })} tone="bubblegum" emoji="🪂" />
        <StatCard label="PCB remitted" value={rm(s("totalPcb"), { decimals: 0 })} hint={`Zakat ${rm(s("totalZakat"), { decimals: 0 })}`} tone="sunny" emoji="🧮" />
        <StatCard label="HRD Corp levy" value={rm(hrd.contributed, { decimals: 0 })} hint={`Balance ${rm(hrd.balance, { decimals: 0 })} unutilised`} tone="tangerine" emoji="🎓" />
      </div>
      {chart.length > 0 && (
        <Card className="mb-6">
          <CardHeader title="Contributions by month" emoji="📊" subtitle="Employee + employer shares, all entities" />
          <CardBody>
            <ColumnChart money data={chart} series={[{ key: "epf", label: "EPF" }, { key: "socsoEis", label: "SOCSO + EIS" }, { key: "pcb", label: "PCB" }]} />
          </CardBody>
        </Card>
      )}
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Callout emoji="🏦">
          <b>KWSP:</b> upload the contribution file via i-Akaun (Majikan). Late payment attracts a 6% p.a. dividend charge (min RM10).
        </Callout>
        <Callout tone="sky" emoji="🛡️">
          <b>PERKESO:</b> SOCSO and EIS are paid together via the ASSIST portal. Wage ceiling is RM6,000.
        </Callout>
        <Callout tone="lime" emoji="🧮">
          <b>LHDN:</b> remit PCB via e-PCB Plus using the CP39 file. Zakat deducted is paid to the state zakat body.
        </Callout>
      </div>
      <Card>
        <CardHeader title="Monthly submissions" emoji="📤" />
        <Table>
          <THead>
            <tr>
              <TH>Period</TH>
              <TH>Entity</TH>
              <TH>Status</TH>
              <TH className="text-right">EPF</TH>
              <TH className="text-right">SOCSO</TH>
              <TH className="text-right">EIS</TH>
              <TH className="text-right">PCB</TH>
              <TH className="text-right">HRDF</TH>
              <TH>Due</TH>
              <TH>Files</TH>
            </tr>
          </THead>
          <tbody>
            {runs.map((r) => (
              <TR key={r.id}>
                <TD className="font-semibold">{periodLabel(r.period)}</TD>
                <TD className="text-xs">{r.company.name}</TD>
                <TD><StatusBadge status={r.status} /></TD>
                <TD className="text-right"><Money value={r.totalEpfEE + r.totalEpfER} /></TD>
                <TD className="text-right"><Money value={r.totalSocsoEE + r.totalSocsoER} /></TD>
                <TD className="text-right"><Money value={r.totalEisEE + r.totalEisER} /></TD>
                <TD className="text-right"><Money value={r.totalPcb} /></TD>
                <TD className="text-right"><Money value={r.totalHrdf} /></TD>
                <TD className="font-mono text-xs">15 {MONTHS[+shiftPeriod(r.period, 1).slice(5) - 1]}</TD>
                <TD className="space-x-2 whitespace-nowrap text-xs">
                  {(["epf", "socso", "cp39"] as const).map((f) => (
                    <a key={f} href={`/api/export/${f}?runId=${r.id}`} className="inline-flex items-center gap-0.5 font-bold underline">
                      <Download size={11} />
                      {f.toUpperCase()}
                    </a>
                  ))}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
