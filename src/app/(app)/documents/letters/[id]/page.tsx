import { notFound } from "next/navigation";
import { requireCtx } from "@/server/context";
import { readableLetter } from "@/server/services/culture.service";
import { PdfButton } from "@/components/pdf-button";
import { ActionButton } from "@/components/forms";
import { Badge } from "@/components/ui";
import { fmtDate } from "@/lib/utils";
import { LetterDocument } from "@/components/letter-document";
import { ackLetterAction } from "../../actions";

/** Printable letter on company letterhead. HR sees any letter; employees see their own issued letters. */
export default async function LetterPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const l = await readableLetter(ctx, id);
  if (!l) notFound();
  const c = l.employee.company;
  return (
    <>
      <div className="no-print mx-auto mb-4 flex max-w-3xl items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {l.status === "DRAFT" && <Badge tone="yellow">Draft (not yet issued)</Badge>}
          {l.status === "ISSUED" && <Badge tone="orange">Awaiting acknowledgement</Badge>}
          {l.status === "ACKNOWLEDGED" && <Badge tone="green">Acknowledged {fmtDate(l.acknowledgedAt)}</Badge>}
        </div>
        <div className="flex gap-2">
          {l.status === "ISSUED" && l.employeeId === ctx.employeeId && (
            <ActionButton action={ackLetterAction} fields={{ id: l.id }} variant="lime" size="md">
              I acknowledge receipt
            </ActionButton>
          )}
          <PdfButton href={`/api/pdf/letter/${l.id}`} />
        </div>
      </div>
      <LetterDocument
        company={c}
        content={l.content}
        draft={l.status === "DRAFT"}
        footerNote={l.status === "ACKNOWLEDGED" ? `Received and acknowledged electronically by ${l.employee.fullName} on ${fmtDate(l.acknowledgedAt, "long")}.` : undefined}
      />
    </>
  );
}
