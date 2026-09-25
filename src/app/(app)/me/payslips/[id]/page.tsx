import { notFound } from "next/navigation";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { PayslipView } from "@/components/payslip-view";
import { LinkButton } from "@/components/ui";
import { PrintButton } from "@/components/print-button";

export default async function MyPayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const slip = await prisma.payslip.findFirst({
    where: { id, employeeId: ctx.employeeId ?? "-", run: { status: { in: ["PAID", "LOCKED"] } } },
    include: { lines: { orderBy: { sortOrder: "asc" } }, run: { include: { company: true } }, employee: { include: { department: true } } },
  });
  if (!slip) notFound();
  return (
    <>
      <div className="no-print mb-4 flex justify-between">
        <LinkButton href="/me/payslips" variant="secondary">← All payslips</LinkButton>
        <PrintButton />
      </div>
      <PayslipView slip={slip} />
    </>
  );
}
