import { BRAND } from "@/lib/brand";
import { fmtDate, rm } from "@/lib/utils";
import { Logo } from "./logo";

export interface InvoiceViewData {
  number: string;
  issuedAt: Date;
  paidAt: Date | null;
  status: string;
  cycle: string;
  seats: number;
  amount: number;
  sst: number;
  paymentRef: string | null;
  plan: string;
  unitPrice: number;
  customer: { name: string; address: string | null; regNo: string | null };
}

/** Crewly's tax invoice / receipt to a customer workspace. Same component on screen and in the PDF. */
export function InvoiceView({ inv }: { inv: InvoiceViewData }) {
  const months = inv.cycle === "YEARLY" ? 10 : 1;
  const paid = inv.status === "PAID";
  return (
    <div className="print-plain mx-auto max-w-3xl rounded-3xl border-2 border-ink bg-card p-8 shadow-brutal-lg">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-ink pb-5">
        <div>
          <Logo href="#" />
          <p className="mt-2 text-xs text-muted">{BRAND.company}</p>
          <p className="text-xs text-muted">Kuala Lumpur, Malaysia · billing@crewly.my</p>
        </div>
        <div className="text-right">
          <p className={`inline-block rounded-lg border-2 border-ink px-3 py-1 font-display text-sm font-extrabold ${paid ? "bg-lime" : "bg-sunny"}`}>
            {paid ? "TAX INVOICE / RECEIPT" : "TAX INVOICE"}
          </p>
          <p className="mt-2 font-display text-lg font-bold">{inv.number}</p>
          <p className="text-xs text-muted">Issued {fmtDate(inv.issuedAt, "long")}</p>
          {inv.paidAt && <p className="text-xs text-muted">Paid {fmtDate(inv.paidAt, "long")}</p>}
        </div>
      </div>

      <div className="border-b-2 border-dashed border-soft-line py-4 text-sm">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Billed to</p>
        <p className="font-semibold">{inv.customer.name}</p>
        {inv.customer.regNo && <p className="text-xs text-ink-2">Company No. {inv.customer.regNo}</p>}
        {inv.customer.address && <p className="max-w-sm text-xs text-ink-2">{inv.customer.address}</p>}
      </div>

      <table className="mt-5 w-full text-sm">
        <thead>
          <tr className="border-b-2 border-ink text-left text-xs font-bold uppercase tracking-wider text-muted">
            <th className="pb-2">Description</th>
            <th className="pb-2 text-right">Seats</th>
            <th className="pb-2 text-right">Unit</th>
            <th className="pb-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-soft-line">
            <td className="py-3">
              Crewly {inv.plan} plan, {inv.cycle === "YEARLY" ? "12 months (billed 10)" : "1 month"}
            </td>
            <td className="py-3 text-right font-mono">{inv.seats}</td>
            <td className="py-3 text-right font-mono">{rm(inv.unitPrice * months)}</td>
            <td className="py-3 text-right font-mono">{rm(inv.amount)}</td>
          </tr>
        </tbody>
      </table>

      <div className="ml-auto mt-4 w-full max-w-xs space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span className="font-mono">{rm(inv.amount)}</span>
        </div>
        <div className="flex justify-between">
          <span>SST 8%</span>
          <span className="font-mono">{rm(inv.sst)}</span>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between rounded-2xl border-2 border-ink bg-grape px-5 py-4 text-white">
        <span className="font-display text-lg font-bold">{paid ? "Total paid" : "Total due"}</span>
        <span className="font-display tabular text-3xl font-extrabold">{rm(inv.amount + inv.sst)}</span>
      </div>

      {inv.paymentRef && <p className="mt-4 text-xs text-muted">Payment reference: <span className="font-mono">{inv.paymentRef}</span></p>}

      <div className="mt-6 border-t-2 border-ink pt-4 text-[11px] text-muted">This is a computer-generated invoice. {BRAND.company} · SST registration pending.</div>
    </div>
  );
}
