import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireCtx } from "@/server/context";
import { loadInvoice } from "@/server/documents";
import { InvoiceView } from "@/components/invoice-view";
import { LinkButton } from "@/components/ui";
import { PdfButton } from "@/components/pdf-button";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx("billing.manage");
  const { id } = await params;
  const doc = await loadInvoice(ctx, id);
  if (!doc) notFound();
  return (
    <>
      <div className="no-print mx-auto mb-4 flex max-w-3xl justify-between">
        <LinkButton href="/settings?tab=billing" variant="secondary">← Billing</LinkButton>
        <PdfButton href={`/api/pdf/invoice/${doc.invoice.id}`} />
      </div>
      <InvoiceView inv={{ ...doc.invoice, paidAt: doc.paidAt, plan: doc.plan, unitPrice: doc.unitPrice, customer: doc.customer }} />
    </>
  );
}
