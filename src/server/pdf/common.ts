import PDFDocument from "pdfkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { storageRoot } from "../services/upload.service";

export type Doc = PDFKit.PDFDocument;

export const A4 = { width: 595.28, height: 841.89 };
export const MARGIN = 50;

/** Creates an A4 PDF and a promise resolving to its bytes once `doc.end()` is called. */
export function createPdf(meta: { title: string; author: string; subject?: string }) {
  const doc = new PDFDocument({ size: "A4", margins: { top: MARGIN, bottom: MARGIN + 20, left: MARGIN, right: MARGIN }, bufferPages: true, info: { Title: meta.title, Author: meta.author, Subject: meta.subject ?? meta.title, Creator: "Crewly" } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  return { doc, done };
}

/**
 * The PDF standard fonts (Helvetica/Times) use WinAnsi encoding. Normalise typographic characters and drop
 * anything outside it (e.g. emoji) so text never renders as garbage.
 */
export function pdfText(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/→/g, "->")
    .replace(/←/g, "<-")
    .replace(/ /g, " ")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF–—•…€]/g, "")
    .replace(/[ \t]+\n/g, "\n");
}

export const money = (n: number) => (n ?? 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex) ?? ["", "16", "14", "0f"];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

/** Loads an uploaded PNG/JPEG (letterhead logo, signature) for embedding. Other formats are skipped. */
export async function loadImage(tenantId: string, url: string | null | undefined): Promise<Buffer | null> {
  if (!url?.startsWith("/api/files/")) return null;
  const up = await prisma.upload.findFirst({ where: { id: url.slice("/api/files/".length), tenantId } });
  if (!up || !["image/png", "image/jpeg"].includes(up.mimeType)) return null;
  try {
    return await readFile(path.join(storageRoot(), up.storagePath));
  } catch {
    return null;
  }
}

export interface LetterheadData {
  tenantId: string;
  name: string;
  regNo: string | null;
  address: string | null;
  phone: string | null;
  letterheadLogo: string | null;
  letterheadColor: string;
  letterheadLayout: string;
  letterheadContact: string | null;
  letterheadFooter: string | null;
}

/** Draws the company letterhead at the top of the current page and returns the y below it. */
export async function drawLetterhead(doc: Doc, c: LetterheadData) {
  const color = hexToRgb(c.letterheadColor || "#16140F");
  const logo = await loadImage(c.tenantId, c.letterheadLogo);
  const width = A4.width - MARGIN * 2;
  const align = c.letterheadLayout === "CENTER" ? "center" : c.letterheadLayout === "RIGHT" ? "right" : "left";
  let y = MARGIN;
  let textX = MARGIN;
  let textW = width;
  if (logo) {
    const logoH = 48;
    if (align === "center") {
      doc.image(logo, A4.width / 2 - 60, y, { fit: [120, logoH], align: "center" });
      y += logoH + 6;
    } else if (align === "right") {
      doc.image(logo, A4.width - MARGIN - 120, y, { fit: [120, logoH], align: "right" });
      textW = width - 130;
    } else {
      doc.image(logo, MARGIN, y, { fit: [120, logoH] });
      textX = MARGIN + 130;
      textW = width - 130;
    }
  }
  const startY = y;
  doc.fillColor(color).font("Helvetica-Bold").fontSize(16).text(pdfText(c.name), textX, y, { width: textW, align });
  doc.fillColor("#555555").font("Helvetica").fontSize(8);
  if (c.regNo) doc.text(pdfText(`Company No. ${c.regNo}`), textX, doc.y, { width: textW, align });
  if (c.address) doc.text(pdfText(c.address), textX, doc.y, { width: textW, align });
  const contact = [c.phone && `Tel: ${c.phone}`, c.letterheadContact].filter(Boolean).join("  •  ");
  if (contact) doc.text(pdfText(contact), textX, doc.y, { width: textW, align });
  const bottom = Math.max(doc.y, logo && align !== "center" ? startY + 48 : doc.y) + 8;
  doc.moveTo(MARGIN, bottom).lineTo(A4.width - MARGIN, bottom).lineWidth(2).strokeColor(color).stroke();
  return bottom + 18;
}

/** Footer on every page: optional letterhead footer text + page numbers. Call before doc.end(). */
export function drawFooters(doc: Doc, footer: string | null | undefined, color = "#16140F") {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = A4.height - MARGIN - 4;
    doc.save();
    // Writing inside the bottom margin must not trigger auto page breaks.
    doc.page.margins.bottom = 0;
    doc.moveTo(MARGIN, y - 6).lineTo(A4.width - MARGIN, y - 6).lineWidth(0.5).strokeColor(hexToRgb(color)).stroke();
    doc.fillColor("#777777").font("Helvetica").fontSize(7);
    if (footer) doc.text(pdfText(footer), MARGIN, y, { width: A4.width - MARGIN * 2 - 60, align: "left", lineBreak: true });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, A4.width - MARGIN - 60, y, { width: 60, align: "right" });
    doc.page.margins.bottom = MARGIN + 20;
    doc.restore();
  }
}

export function watermark(doc: Doc, text: string) {
  doc.save();
  doc.fillColor("#000000").opacity(0.06).font("Helvetica-Bold").fontSize(96);
  doc.rotate(-30, { origin: [A4.width / 2, A4.height / 2] });
  doc.text(text, 0, A4.height / 2 - 50, { width: A4.width, align: "center" });
  doc.restore();
  doc.opacity(1);
}
