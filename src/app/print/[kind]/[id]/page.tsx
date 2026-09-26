import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCtx } from "@/server/context";
import { eaYear, loadEa, loadInvoice, loadLetter, loadPayslip } from "@/server/documents";
import { PayslipView } from "@/components/payslip-view";
import { LetterDocument } from "@/components/letter-document";
import { EaFormView } from "@/components/ea-form-view";
import { InvoiceView } from "@/components/invoice-view";
import { fmtDate, periodLabel } from "@/lib/utils";

export const metadata: Metadata = { robots: { index: false, follow: false } };

type Props = { params: Promise<{ kind: string; id: string }>; searchParams: Promise<{ year?: string }> };

/**
 * One document, alone on an A4-wide sheet, rendered with exactly the components and styles used on screen.
 * The PDF endpoint opens this page in headless Chromium and prints it, so the PDF matches what users see.
 * Access rules are the same loaders the PDF endpoint uses.
 */
export default async function PrintDocumentPage({ params, searchParams }: Props) {
  const ctx = await getCtx();
  if (!ctx) notFound();
  const [{ kind, id }, sp] = await Promise.all([params, searchParams]);

  switch (kind) {
    case "payslip": {
      const slip = await loadPayslip(ctx, id);
      if (!slip) notFound();
      return (
        <Sheet title={`Payslip ${periodLabel(slip.period)} - ${slip.employee.fullName}`}>
          <PayslipView slip={slip} />
        </Sheet>
      );
    }
    case "letter": {
      const l = await loadLetter(ctx, id);
      if (!l) notFound();
      return (
        <Sheet title={`${l.title.split(" — ")[0]} - ${l.employee.fullName}`}>
          <LetterDocument
            company={l.employee.company}
            content={l.content}
            draft={l.status === "DRAFT"}
            footerNote={l.acknowledgedAt ? `Received and acknowledged electronically by ${l.employee.fullName} on ${fmtDate(l.acknowledgedAt, "long")}.` : undefined}
          />
        </Sheet>
      );
    }
    case "ea": {
      const doc = await loadEa(ctx, id, eaYear(sp.year));
      if (!doc) notFound();
      return (
        <Sheet title={`Borang EA ${doc.ea.year} - ${doc.ea.employee.name}`}>
          <EaFormView ea={doc.ea} />
          {doc.footer && <p className="mt-4 text-center text-[10px] text-muted">{doc.footer}</p>}
        </Sheet>
      );
    }
    case "invoice": {
      const doc = await loadInvoice(ctx, id);
      if (!doc) notFound();
      return (
        <Sheet title={doc.invoice.number}>
          <InvoiceView inv={{ ...doc.invoice, paidAt: doc.paidAt, plan: doc.plan, unitPrice: doc.unitPrice, customer: doc.customer }} />
        </Sheet>
      );
    }
    default:
      notFound();
  }
}

function Sheet({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="pdf-render" data-title={title}>
      <title>{title}</title>
      {children}
    </main>
  );
}
