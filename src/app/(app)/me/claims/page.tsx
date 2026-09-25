import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { Card, CardHeader, EmptyState, Money, PageHeader, StatCard, StatusBadge, Table, TD, TH, THead, TR } from "@/components/ui";
import { ActionButton } from "@/components/forms";
import { ClaimButton, LoanButton } from "@/components/request-forms";
import { fmtDate, rm, round2, todayMY } from "@/lib/utils";
import { humanize } from "@/lib/constants";
import { cancelClaimAction } from "../actions";

export const metadata: Metadata = { title: "My claims" };

export default async function MyClaimsPage() {
  const ctx = await requireCtx();
  const id = ctx.employeeId!;
  const year = todayMY().getUTCFullYear();
  const [claims, loans] = await Promise.all([
    prisma.claim.findMany({ where: { employeeId: id }, include: { claimType: true }, orderBy: { date: "desc" } }),
    prisma.loan.findMany({ where: { employeeId: id }, orderBy: { createdAt: "desc" }, include: { repayments: true } }),
  ]);
  const ytd = round2(claims.filter((c) => c.date.getUTCFullYear() === year && ["APPROVED", "PAID"].includes(c.status)).reduce((s, c) => s + c.amount, 0));
  const pending = round2(claims.filter((c) => c.status === "PENDING").reduce((s, c) => s + c.amount, 0));
  return (
    <>
      <PageHeader title="Claims & advances" emoji="🧾" actions={<><LoanButton tenantId={ctx.tenantId} /><ClaimButton tenantId={ctx.tenantId} btn={{ variant: "primary" }} /></>} />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label={`Reimbursed ${year}`} value={rm(ytd)} tone="lime" emoji="💰" />
        <StatCard label="Awaiting approval" value={rm(pending)} tone="sunny" emoji="⏳" />
        <StatCard label="Outstanding loans" value={rm(loans.filter((l) => l.status === "ACTIVE").reduce((s, l) => s + l.balance, 0))} tone="sky" emoji="🪙" />
      </div>
      <Card className="mb-6">
        <CardHeader title="My claims" emoji="🧾" />
        {claims.length === 0 ? (
          <EmptyState emoji="🧾" title="No claims yet" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Type</TH>
                <TH>Description</TH>
                <TH className="text-right">Amount</TH>
                <TH>Status</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {claims.map((c) => (
                <TR key={c.id}>
                  <TD className="text-xs">{fmtDate(c.date)}</TD>
                  <TD>
                    {c.claimType.emoji} {c.claimType.name}
                  </TD>
                  <TD className="max-w-xs text-xs">
                    {c.description}
                    {c.mileageKm ? ` (${c.mileageKm} km)` : ""}
                    {c.approverNote && <span className="block text-muted">Note: {c.approverNote}</span>}
                  </TD>
                  <TD className="text-right">
                    <Money value={c.amount} />
                  </TD>
                  <TD>
                    <StatusBadge status={c.status} />
                  </TD>
                  <TD className="text-right">{c.status === "PENDING" && <ActionButton action={cancelClaimAction} fields={{ id: c.id }} confirm="Withdraw this claim?">Withdraw</ActionButton>}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader title="Loans & advances" emoji="🪙" />
        {loans.length === 0 ? (
          <EmptyState emoji="🪙" title="No loans or advances" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Type</TH>
                <TH className="text-right">Amount</TH>
                <TH className="text-right">Instalment</TH>
                <TH>Starts</TH>
                <TH className="text-right">Balance</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <tbody>
              {loans.map((l) => (
                <TR key={l.id}>
                  <TD>{humanize(l.type)}</TD>
                  <TD className="text-right"><Money value={l.principal} /></TD>
                  <TD className="text-right"><Money value={l.installment} /></TD>
                  <TD>{l.startPeriod}</TD>
                  <TD className="text-right font-bold"><Money value={l.balance} /></TD>
                  <TD><StatusBadge status={l.status} /></TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
