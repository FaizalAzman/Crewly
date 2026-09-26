import { NextResponse, type NextRequest } from "next/server";
import { getCtx } from "@/server/context";
import { SESSION_COOKIE } from "@/lib/auth/session-token";
import { eaYear, loadEa, loadInvoice, loadLetter, loadPayslip } from "@/server/documents";
import { renderPdf } from "@/server/pdf/render";
import { letterPdf } from "@/server/pdf/letter";
import { payslipPdf } from "@/server/pdf/payslip";
import { eaPdf } from "@/server/pdf/ea";
import { invoicePdf } from "@/server/pdf/invoice";
import { fmtDate, periodLabel } from "@/lib/utils";

export const runtime = "nodejs";

function pdf(bytes: Buffer, filename: string, download: boolean) {
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename.replace(/[^\w.\- ]+/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

let warned = false;

/**
 * Prints the on-screen document (/print/<kind>/<id>) with Chromium, so the PDF looks exactly like the page.
 * If Chromium isn't available (or PDF_RENDERER=pdfkit), falls back to the built-in pdfkit layout.
 */
async function render(req: NextRequest, printPath: string, fallback: () => Promise<Buffer>) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token && process.env.PDF_RENDERER !== "pdfkit") {
    try {
      return await renderPdf(printPath, token);
    } catch (e) {
      if (!warned) console.warn(`[pdf] Chromium rendering unavailable, using the pdfkit layout instead: ${(e as Error).message}`);
      warned = true;
    }
  }
  return fallback();
}

/** PDF downloads: /api/pdf/letter/<id>, /api/pdf/payslip/<id>, /api/pdf/invoice/<id>, /api/pdf/ea/<employeeId>?year=2026. Add ?inline=1 to view in the browser. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { kind, id } = await params;
  const download = req.nextUrl.searchParams.get("inline") !== "1";
  const notFound = NextResponse.json({ error: "Not found" }, { status: 404 });
  const printPath = `/print/${kind}/${encodeURIComponent(id)}`;

  if (kind === "payslip") {
    const s = await loadPayslip(ctx, id);
    if (!s) return notFound;
    const e = s.employee;
    const bytes = await render(req, printPath, () =>
      payslipPdf({
        periodLabel: periodLabel(s.period),
        payDate: fmtDate(s.run.payDate, "long"),
        company: { ...s.run.company, tenantId: ctx.tenantId },
        employee: {
          fullName: e.fullName,
          employeeNo: e.employeeNo,
          idNo: e.icNo ?? e.passportNo ?? "-",
          jobTitle: e.jobTitle,
          department: e.department?.name ?? "-",
          bank: [e.bankName, e.bankAccountNo].filter(Boolean).join(" · ") || "-",
          epfNo: e.epfNo ?? "-",
          socsoNo: e.socsoNo ?? "-",
          taxNo: e.taxNo ?? "-",
        },
        daysPaid: s.daysPaid,
        workingDays: s.workingDays,
        earnings: s.lines.filter((l) => l.kind === "EARNING"),
        deductions: s.lines.filter((l) => l.kind === "DEDUCTION"),
        employer: s.lines.filter((l) => l.kind === "EMPLOYER"),
        grossPay: s.grossPay,
        totalDeductions: s.totalDeductions,
        netPay: s.netPay,
      }),
    );
    return pdf(bytes, `Payslip ${s.period} - ${e.fullName}.pdf`, download);
  }

  if (kind === "letter") {
    const l = await loadLetter(ctx, id);
    if (!l) return notFound;
    const bytes = await render(req, printPath, () =>
      letterPdf({
        title: l.title,
        content: l.content,
        status: l.status,
        acknowledgedNote: l.acknowledgedAt ? `Received and acknowledged electronically by ${l.employee.fullName} on ${fmtDate(l.acknowledgedAt, "long")}.` : undefined,
        company: { ...l.employee.company, tenantId: ctx.tenantId },
      }),
    );
    return pdf(bytes, `${l.title.split(" — ")[0]} - ${l.employee.fullName}.pdf`, download);
  }

  if (kind === "invoice") {
    const doc = await loadInvoice(ctx, id);
    if (!doc) return notFound;
    const inv = doc.invoice;
    const bytes = await render(req, printPath, () =>
      invoicePdf({ ...inv, paidAt: doc.paidAt, customer: doc.customer, plan: doc.plan, unitPrice: doc.unitPrice }),
    );
    return pdf(bytes, `${inv.number}.pdf`, download);
  }

  if (kind === "ea") {
    const year = eaYear(req.nextUrl.searchParams.get("year"));
    const doc = await loadEa(ctx, id, year); // own record, or tax.manage
    if (!doc) return notFound;
    const bytes = await render(req, `${printPath}?year=${year}`, () => eaPdf(doc.ea, doc.footer));
    return pdf(bytes, `Borang EA ${year} - ${doc.ea.employee.name}.pdf`, download);
  }

  return NextResponse.json({ error: "Unknown document" }, { status: 400 });
}
