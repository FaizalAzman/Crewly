import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { Card, CardHeader, EmptyState, PageHeader, StatusBadge, Table, TD, TH, THead, TR } from "@/components/ui";
import { ActionButton } from "@/components/forms";
import { ApplyLeaveButton } from "@/components/request-forms";
import { available } from "@/server/services/leave.service";
import { fmtDate, todayMY } from "@/lib/utils";
import { cancelLeaveAction } from "../actions";

export const metadata: Metadata = { title: "My leave" };

export default async function MyLeavePage() {
  const ctx = await requireCtx();
  const id = ctx.employeeId!;
  const year = todayMY().getUTCFullYear();
  const [emp, balances, requests] = await Promise.all([
    prisma.employee.findUniqueOrThrow({ where: { id } }),
    prisma.leaveBalance.findMany({ where: { employeeId: id, year }, include: { leaveType: true }, orderBy: { leaveType: { name: "asc" } } }),
    prisma.leaveRequest.findMany({ where: { employeeId: id }, include: { leaveType: true }, orderBy: { startDate: "desc" } }),
  ]);
  const today = todayMY();
  return (
    <>
      <PageHeader title="My leave" emoji="🌴" subtitle={`Entitlements follow the Employment Act 1955 and company policy · ${year}`} actions={<ApplyLeaveButton tenantId={ctx.tenantId} gender={emp.gender} />} />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
        {balances
          .filter((b) => b.entitled + b.adjustment + b.carriedForward > 0 || b.taken > 0)
          .map((b) => (
            <div key={b.id} className="rounded-2xl border-2 border-ink bg-card p-4 shadow-brutal-sm">
              <p className="truncate text-xs font-bold">
                {b.leaveType.emoji} {b.leaveType.name}
              </p>
              <p className="font-display mt-1 text-3xl font-extrabold">{available(b)}</p>
              <p className="text-[11px] text-muted">
                {b.entitled} entitled{b.carriedForward ? ` + ${b.carriedForward} c/f` : ""}
                {b.adjustment ? ` + ${b.adjustment} adj` : ""} · {b.taken} used
              </p>
            </div>
          ))}
      </div>
      <Card>
        <CardHeader title="My requests" emoji="🗓️" />
        {requests.length === 0 ? (
          <EmptyState emoji="🏝️" title="No leave yet" body="Go on, you deserve a break." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Type</TH>
                <TH>Dates</TH>
                <TH>Days</TH>
                <TH>Reason</TH>
                <TH>Status</TH>
                <TH>Note</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {requests.map((r) => (
                <TR key={r.id}>
                  <TD>
                    {r.leaveType.emoji} {r.leaveType.name}
                  </TD>
                  <TD className="text-xs">
                    {fmtDate(r.startDate)}
                    {r.endDate.getTime() !== r.startDate.getTime() && ` – ${fmtDate(r.endDate)}`}
                    {r.halfDay && ` (${r.halfDay})`}
                  </TD>
                  <TD>{r.days}</TD>
                  <TD className="max-w-xs truncate text-xs">{r.reason}</TD>
                  <TD>
                    <StatusBadge status={r.status} />
                  </TD>
                  <TD className="max-w-xs truncate text-xs text-muted">{r.approverNote}</TD>
                  <TD className="text-right">
                    {(r.status === "PENDING" || (r.status === "APPROVED" && r.startDate > today)) && (
                      <ActionButton action={cancelLeaveAction} fields={{ id: r.id }} confirm="Cancel this leave?">
                        Cancel
                      </ActionButton>
                    )}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
