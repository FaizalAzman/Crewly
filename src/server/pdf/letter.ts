import { A4, MARGIN, createPdf, drawFooters, drawLetterhead, loadImage, pdfText, watermark, type LetterheadData } from "./common";

export interface LetterPdfInput {
  title: string;
  content: string;
  status: string;
  acknowledgedNote?: string;
  company: LetterheadData & { signatureImage: string | null };
}

/** Renders a letter on company letterhead as a true (vector, selectable-text) PDF. */
export async function letterPdf(input: LetterPdfInput): Promise<Buffer> {
  const { doc, done } = createPdf({ title: input.title, author: input.company.name });
  const signature = await loadImage(input.company.tenantId, input.company.signatureImage);
  if (input.status === "DRAFT") watermark(doc, "DRAFT");
  const y = await drawLetterhead(doc, input.company);
  doc.fillColor("#111111").font("Times-Roman").fontSize(11.5);
  doc.x = MARGIN;
  doc.y = y;
  const width = A4.width - MARGIN * 2;
  const blocks = pdfText(input.content).split(/^\[signature\]$/m);
  blocks.forEach((block, i) => {
    doc.text(block.replace(/^\n+|\n+$/g, (m) => (i > 0 ? "" : m)), { width, lineGap: 3 });
    if (i < blocks.length - 1) {
      if (signature) {
        if (doc.y + 60 > A4.height - MARGIN - 30) doc.addPage();
        doc.image(signature, MARGIN, doc.y + 4, { fit: [180, 50] });
        doc.y += 58;
      } else {
        doc.moveDown(2.5);
      }
    }
  });
  if (input.acknowledgedNote) {
    doc.moveDown(2).font("Helvetica-Oblique").fontSize(8).fillColor("#666666").text(pdfText(input.acknowledgedNote), { width });
  }
  drawFooters(doc, input.company.letterheadFooter, input.company.letterheadColor);
  doc.end();
  return done;
}
