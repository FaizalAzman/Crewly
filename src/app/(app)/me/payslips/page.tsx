import Link from "next/link";
import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { Card, CardHeader, EmptyState, Money, PageHeader, Table, TD, TH, THead, TR } from "@/components/ui";
import { TrendChart } from "@/components/charts";
import { periodLabel, round2 } from "@/lib/utils";
import { MONTHS } from "@/lib/constants";

export const metadata: Metadata = { title: "My payslips" };

export default async function MyPayslipsPage() {
  const ctx = await requireCtx();
  const slips = await prisma.payslip.findMany({
    where: { employeeId: ctx.employeeId!, run: { status: { in: ["PAID", "LOCKED"] } } },
    orderBy: { period: "desc" },
  });
  const year = slips[0]?.period.slice(0, 4);
  const ytd = slips.filter((s) => s.period.startsWith(year ?? ""));
  const sum = (k: "grossPay" | "netPay" | "epfEE" | "pcb") => round2(ytd.reduce((a, s) => a + s[k], 0));
  return (
    <>
      <PageHeader title="Payslips" emoji="💸" subtitle="Only paid payroll runs appear here." />
      {slips.length === 0 ? (
        <Card>
          <EmptyState emoji="💸" title="No payslips yet" body="Your first payslip appears here after payday." />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Net pay trend" emoji="📈" />
            <div className="p-4">
              <TrendChart money data={[...slips].reverse().map((s) => ({ label: `${MONTHS[+s.period.slice(5) - 1]} ${s.period.slice(2, 4)}`, net: s.netPay }))} series={[{ key: "net", label: "Net pay" }]} height={220} />
            </div>
          </Card>
          <Card>
            <CardHeader title={`Year to date · ${year}`} emoji="🧮" />
            <div className="space-y-2 p-5 text-sm">
              {([["Gross pay", "grossPay"], ["EPF (you)", "epfEE"], ["PCB paid", "pcb"], ["Net pay", "netPay"]] as const).map(([l, k]) => (
                <div key={k} className="flex justify-between">
                  <span>{l}</span>
                  <Money value={sum(k)} className="font-semibold" />
                </div>
              ))}
            </div>
          </Card>
          <Card className="lg:col-span-3">
            <Table>
              <THead>
                <tr>
                  <TH>Period</TH>
                  <TH className="text-right">Gross</TH>
                  <TH className="text-right">Deductions</TH>
                  <TH className="text-right">Net</TH>
                  <TH />
                </tr>
              </THead>
              <tbody>
                {slips.map((s) => (
                  <TR key={s.id}>
                    <TD className="font-semibold">{periodLabel(s.period)}</TD>
                    <TD className="text-right"><Money value={s.grossPay} /></TD>
                    <TD className="text-right"><Money value={s.totalDeductions} /></TD>
                    <TD className="text-right font-bold"><Money value={s.netPay} /></TD>
                    <TD className="text-right">
                      <Link href={`/me/payslips/${s.id}`} className="text-xs font-bold underline">View</Link>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
      )}
    </>
  );
}
