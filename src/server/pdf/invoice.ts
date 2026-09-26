import { A4, MARGIN, createPdf, drawFooters, money, pdfText } from "./common";

export interface InvoicePdfInput {
  number: string;
  issuedAt: Date;
  paidAt: Date | null;
  status: string;
  customer: { name: string; address: string | null; regNo: string | null };
  plan: string;
  cycle: string;
  seats: number;
  unitPrice: number;
  amount: number;
  sst: number;
  paymentRef: string | null;
}

/** Crewly's tax invoice to the customer workspace. */
export async function invoicePdf(inv: InvoicePdfInput): Promise<Buffer> {
  const { doc, done } = createPdf({ title: `Invoice ${inv.number}`, author: "Crewly Technologies Sdn Bhd", subject: "Invoice" });
  const width = A4.width - MARGIN * 2;
  const d = (x: Date | null) => (x ? x.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-");

  doc.font("Helvetica-Bold").fontSize(20).fillColor("#7C5CFF").text("crewly", MARGIN, MARGIN);
  doc.font("Helvetica").fontSize(8).fillColor("#555555").text("Crewly Technologies Sdn Bhd · Kuala Lumpur, Malaysia · billing@crewly.my", MARGIN, doc.y + 2);
  doc.font("Helvetica-Bold").fontSize(16).fillColor("#111111").text(inv.status === "PAID" ? "TAX INVOICE / RECEIPT" : "TAX INVOICE", MARGIN, MARGIN, { width, align: "right" });
  doc.font("Helvetica").fontSize(9).fillColor("#333333").text(`No. ${inv.number}\nIssued ${d(inv.issuedAt)}${inv.paidAt ? `\nPaid ${d(inv.paidAt)}` : ""}`, MARGIN, doc.y + 2, { width, align: "right" });

  let y = 140;
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#777777").text("BILLED TO", MARGIN, y);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#111111").text(pdfText(inv.customer.name), MARGIN, y + 12);
  doc.font("Helvetica").fontSize(9).fillColor("#444444");
  if (inv.customer.regNo) doc.text(pdfText(`Company No. ${inv.customer.regNo}`));
  if (inv.customer.address) doc.text(pdfText(inv.customer.address), { width: width / 2 });
  y = Math.max(doc.y, y + 40) + 20;

  doc.rect(MARGIN, y, width, 20).fill("#16140F");
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9);
  doc.text("Description", MARGIN + 8, y + 6).text("Qty", MARGIN + 290, y + 6, { width: 50, align: "right" }).text("Unit (RM)", MARGIN + 345, y + 6, { width: 70, align: "right" }).text("Amount (RM)", MARGIN + 415, y + 6, { width: width - 423, align: "right" });
  y += 28;
  const months = inv.cycle === "YEARLY" ? 10 : 1;
  doc.fillColor("#111111").font("Helvetica").fontSize(9.5);
  doc.text(pdfText(`Crewly ${inv.plan} plan, ${inv.cycle === "YEARLY" ? "12 months (billed 10)" : "1 month"}`), MARGIN + 8, y, { width: 270 });
  doc.text(`${inv.seats} seats`, MARGIN + 290, y, { width: 50, align: "right" });
  doc.text(money(inv.unitPrice * months), MARGIN + 345, y, { width: 70, align: "right" });
  doc.text(money(inv.amount), MARGIN + 415, y, { width: width - 423, align: "right" });
  y += 30;
  doc.moveTo(MARGIN, y).lineTo(A4.width - MARGIN, y).lineWidth(0.5).strokeColor("#cccccc").stroke();
  y += 10;
  const line = (label: string, value: string, bold = false) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 11 : 9.5).fillColor("#111111");
    doc.text(label, MARGIN + 300, y, { width: 120 }).text(value, MARGIN + 415, y, { width: width - 423, align: "right" });
    y += bold ? 20 : 16;
  };
  line("Subtotal", money(inv.amount));
  line("SST 8%", money(inv.sst));
  line("Total (RM)", money(inv.amount + inv.sst), true);
  if (inv.paymentRef) {
    y += 10;
    doc.font("Helvetica").fontSize(8.5).fillColor("#555555").text(`Payment reference: ${inv.paymentRef}`, MARGIN, y);
  }
  drawFooters(doc, "Crewly Technologies Sdn Bhd · SST registration pending · This is a computer-generated invoice.");
  doc.end();
  return done;
}
