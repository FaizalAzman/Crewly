/* eslint-disable @next/next/no-img-element */
import type { Company } from "@prisma/client";

type Letterhead = Pick<
  Company,
  "name" | "regNo" | "address" | "phone" | "letterheadLogo" | "letterheadColor" | "letterheadLayout" | "letterheadContact" | "letterheadFooter" | "signatureImage"
>;

const ALIGN: Record<string, string> = { LEFT: "items-start text-left", CENTER: "items-center text-center", RIGHT: "items-end text-right" };

/**
 * A letter on company letterhead. The letterhead comes from the legal entity at render time, so updating it
 * restyles every letter. A line reading exactly "[signature]" becomes the signature image (or blank space
 * for a wet signature).
 */
export function LetterDocument({ company, content, draft, footerNote }: { company: Letterhead; content: string; draft?: boolean; footerNote?: string }) {
  const color = company.letterheadColor || "#16140F";
  const parts = content.split(/^\[signature\]$/m);
  return (
    <article className="letter-page print-plain relative mx-auto flex min-h-[1000px] max-w-[800px] flex-col rounded-2xl border-2 border-ink bg-white p-12 text-[#111] shadow-brutal-lg print:min-h-0 print:p-0">
      {draft && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-8xl font-extrabold text-black/5 -rotate-12">DRAFT</div>}
      <header className={`mb-8 flex flex-col gap-2 border-b-[3px] pb-4 ${ALIGN[company.letterheadLayout] ?? ALIGN.LEFT}`} style={{ borderColor: color }}>
        <div className={`flex w-full items-center gap-4 ${company.letterheadLayout === "CENTER" ? "flex-col" : company.letterheadLayout === "RIGHT" ? "flex-row-reverse" : ""}`}>
          {company.letterheadLogo && <img src={company.letterheadLogo} alt={`${company.name} logo`} className="max-h-16 max-w-[180px] object-contain" />}
          <div className={company.letterheadLayout === "CENTER" ? "text-center" : company.letterheadLayout === "RIGHT" ? "text-right flex-1" : "flex-1"}>
            <p className="font-display text-2xl font-extrabold" style={{ color }}>
              {company.name}
            </p>
            {company.regNo && <p className="text-[11px] text-neutral-600">Company No. {company.regNo}</p>}
            {company.address && <p className="text-[11px] text-neutral-600">{company.address}</p>}
            <p className="text-[11px] text-neutral-600">{[company.phone && `Tel: ${company.phone}`, company.letterheadContact].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
      </header>
      <div className="flex-1 whitespace-pre-wrap font-serif text-[15px] leading-relaxed">
        {parts.map((p, i) => (
          <span key={i}>
            {p}
            {i < parts.length - 1 &&
              (company.signatureImage ? <img src={company.signatureImage} alt="Signature" className="my-1 block max-h-16 max-w-[220px] object-contain" /> : <span className="block h-12" />)}
          </span>
        ))}
      </div>
      {(company.letterheadFooter || footerNote) && (
        <footer className="mt-10 border-t pt-3 text-center text-[10px] text-neutral-500" style={{ borderColor: color }}>
          {footerNote && <p className="mb-1 text-left text-xs text-neutral-600">{footerNote}</p>}
          {company.letterheadFooter}
        </footer>
      )}
    </article>
  );
}
