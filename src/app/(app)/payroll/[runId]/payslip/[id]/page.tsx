import { notFound } from "next/navigation";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { PayslipView } from "@/components/payslip-view";
import { LinkButton } from "@/components/ui";
import { PrintButton } from "@/components/print-button";

export default async function PayslipPage({ params }: { params: Promise<{ runId: string; id: string }> }) {
  const ctx = await requireCtx("payroll.manage");
  const { runId, id } = await params;
  const slip = await prisma.payslip.findFirst({
    where: { id, runId, tenantId: ctx.tenantId },
    include: { lines: { orderBy: { sortOrder: "asc" } }, run: { include: { company: true } }, employee: { include: { department: true } } },
  });
  if (!slip) notFound();
  return (
    <>
      <div className="no-print mb-4 flex justify-between">
        <LinkButton href={`/payroll/${runId}`} variant="secondary">← Back to run</LinkButton>
        <PrintButton />
      </div>
      <PayslipView slip={slip} />
      <div className="no-print mx-auto mt-6 max-w-3xl rounded-2xl border-2 border-dashed border-ink bg-paper-2 p-4 text-xs">
        <p className="font-bold">How this was calculated</p>
        <ul className="mt-2 grid gap-1 md:grid-cols-2">
          <li>EPF wages: RM{slip.epfWages.toFixed(2)}</li>
          <li>SOCSO / EIS wages: RM{slip.socsoWages.toFixed(2)} (capped at RM6,000)</li>
          <li>PCB normal: RM{slip.pcbNormal.toFixed(2)} · additional: RM{slip.pcbAdditional.toFixed(2)}</li>
          <li>Reliefs claimed this month (TP1 + SOCSO/EIS): RM{slip.lpUsed.toFixed(2)}</li>
          <li>Unpaid leave: {slip.unpaidLeaveDays} day(s) = RM{slip.unpaidLeaveDeduction.toFixed(2)}</li>
          <li>Employer cost: RM{slip.employerCost.toFixed(2)}</li>
        </ul>
      </div>
    </>
  );
}
