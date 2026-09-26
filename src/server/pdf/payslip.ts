import { A4, MARGIN, createPdf, drawFooters, drawLetterhead, hexToRgb, money, pdfText, type LetterheadData } from "./common";

export interface PayslipPdfInput {
  periodLabel: string;
  payDate: string;
  company: LetterheadData;
  employee: { fullName: string; employeeNo: string; idNo: string; jobTitle: string; department: string; bank: string; epfNo: string; socsoNo: string; taxNo: string };
  daysPaid: number;
  workingDays: number;
  earnings: { name: string; amount: number }[];
  deductions: { name: string; amount: number }[];
  employer: { name: string; amount: number }[];
  grossPay: number;
  totalDeductions: number;
  netPay: number;
}

function table(doc: PDFKit.PDFDocument, x: number, y: number, w: number, title: string, rows: { name: string; amount: number }[], totalLabel: string, total: number) {
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#777777").text(title.toUpperCase(), x, y, { width: w });
  let cy = y + 14;
  doc.font("Helvetica").fontSize(9.5).fillColor("#111111");
  for (const r of rows) {
    doc.text(pdfText(r.name), x, cy, { width: w - 80 });
    const h = doc.heightOfString(pdfText(r.name), { width: w - 80 });
    doc.fillColor(r.amount < 0 ? "#c0392b" : "#111111").text(money(r.amount), x + w - 80, cy, { width: 80, align: "right" }).fillColor("#111111");
    cy += Math.max(h, 12) + 3;
  }
  if (!rows.length) {
    doc.fillColor("#999999").text("None", x, cy).fillColor("#111111");
    cy += 15;
  }
  doc.moveTo(x, cy + 2).lineTo(x + w, cy + 2).lineWidth(1).strokeColor("#111111").stroke();
  doc.font("Helvetica-Bold").text(totalLabel, x, cy + 7, { width: w - 80 }).text(money(total), x + w - 80, cy + 7, { width: 80, align: "right" });
  return cy + 24;
}

export async function payslipPdf(p: PayslipPdfInput): Promise<Buffer> {
  const { doc, done } = createPdf({ title: `Payslip ${p.periodLabel} - ${p.employee.fullName}`, author: p.company.name, subject: "Payslip" });
  let y = await drawLetterhead(doc, p.company);
  const width = A4.width - MARGIN * 2;
  const accent = hexToRgb(p.company.letterheadColor || "#16140F");

  doc.font("Helvetica-Bold").fontSize(14).fillColor(accent).text(`PAYSLIP  ·  ${pdfText(p.periodLabel)}`, MARGIN, y);
  doc.font("Helvetica").fontSize(8.5).fillColor("#555555").text(`Paid on ${pdfText(p.payDate)}`, MARGIN, y + 3, { width, align: "right" });
  y += 26;

  const info: [string, string][] = [
    ["Name", p.employee.fullName], ["Employee no.", p.employee.employeeNo], ["NRIC / passport", p.employee.idNo],
    ["Position", p.employee.jobTitle], ["Department", p.employee.department], ["Bank", p.employee.bank],
    ["EPF no.", p.employee.epfNo], ["SOCSO no.", p.employee.socsoNo], ["Tax no.", p.employee.taxNo],
    ["Days paid", `${p.daysPaid} / ${p.workingDays}`],
  ];
  const colW = width / 3;
  info.forEach(([k, v], i) => {
    const cx = MARGIN + (i % 3) * colW;
    const cy = y + Math.floor(i / 3) * 26;
    doc.font("Helvetica").fontSize(7).fillColor("#888888").text(k.toUpperCase(), cx, cy, { width: colW - 8 });
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#111111").text(pdfText(v) || "-", cx, cy + 9, { width: colW - 8, lineBreak: false, ellipsis: true });
  });
  y += Math.ceil(info.length / 3) * 26 + 10;
  doc.moveTo(MARGIN, y).lineTo(A4.width - MARGIN, y).dash(3, { space: 3 }).lineWidth(0.5).strokeColor("#bbbbbb").stroke().undash();
  y += 14;

  const half = (width - 24) / 2;
  const leftEnd = table(doc, MARGIN, y, half, "Earnings", p.earnings, "Gross pay", p.grossPay);
  const rightEnd = table(doc, MARGIN + half + 24, y, half, "Deductions", p.deductions, "Total deductions", p.totalDeductions);
  y = Math.max(leftEnd, rightEnd) + 8;

  doc.roundedRect(MARGIN, y, width, 40, 6).fill(accent);
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(12).text("NET PAY", MARGIN + 14, y + 14);
  doc.fontSize(16).text(`RM ${money(p.netPay)}`, MARGIN, y + 11, { width: width - 14, align: "right" });
  y += 56;

  doc.font("Helvetica-Bold").fontSize(8).fillColor("#777777").text("EMPLOYER CONTRIBUTIONS (NOT DEDUCTED FROM YOU)", MARGIN, y);
  y += 13;
  const ew = width / Math.max(1, p.employer.length);
  p.employer.forEach((e, i) => {
    doc.font("Helvetica").fontSize(7.5).fillColor("#666666").text(pdfText(e.name), MARGIN + i * ew, y, { width: ew - 6 });
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#111111").text(`RM ${money(e.amount)}`, MARGIN + i * ew, y + 11, { width: ew - 6 });
  });
  y += 36;
  doc.font("Helvetica-Oblique").fontSize(7.5).fillColor("#888888").text("This is a computer-generated payslip. No signature is required. Keep it confidential.", MARGIN, y, { width });

  drawFooters(doc, p.company.letterheadFooter, p.company.letterheadColor);
  doc.end();
  return done;
}
