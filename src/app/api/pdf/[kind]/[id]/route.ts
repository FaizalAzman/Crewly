import { NextResponse, type NextRequest } from "next/server";
import { getCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { readableLetter } from "@/server/services/culture.service";
import { eaForm } from "@/server/services/tax.service";
import { letterPdf } from "@/server/pdf/letter";
import { payslipPdf } from "@/server/pdf/payslip";
import { eaPdf } from "@/server/pdf/ea";
import { invoicePdf } from "@/server/pdf/invoice";
import { PLANS, type PlanKey } from "@/server/services/subscription.service";
import { DomainError } from "@/server/types";
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

/** True PDF downloads: /api/pdf/letter/<id>, /api/pdf/payslip/<id>, /api/pdf/ea/<employeeId>?year=2026. Add ?inline=1 to view in the browser. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { kind, id } = await params;
  const download = req.nextUrl.searchParams.get("inline") !== "1";
  const notFound = NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    if (kind === "letter") {
      const l = await readableLetter(ctx, id);
      if (!l) return notFound;
      const bytes = await letterPdf({
        title: l.title,
        content: l.content,
        status: l.status,
        acknowledgedNote: l.acknowledgedAt ? `Received and acknowledged electronically by ${l.employee.fullName} on ${fmtDate(l.acknowledgedAt, "long")}.` : undefined,
        company: { ...l.employee.company, tenantId: ctx.tenantId },
      });
      return pdf(bytes, `${l.title.split(" — ")[0]} - ${l.employee.fullName}.pdf`, download);
    }

    if (kind === "payslip") {
      const s = await prisma.payslip.findFirst({
        where: { id, tenantId: ctx.tenantId },
        include: { lines: { orderBy: { sortOrder: "asc" } }, run: { include: { company: true } }, employee: { include: { department: true } } },
      });
      if (!s) return notFound;
      const own = s.employeeId === ctx.employeeId && ["PAID", "LOCKED"].includes(s.run.status);
      if (!own && !can(ctx, "payroll.manage")) return notFound;
      const e = s.employee;
      const bytes = await payslipPdf({
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
      });
      return pdf(bytes, `Payslip ${s.period} - ${e.fullName}.pdf`, download);
    }

    if (kind === "invoice") {
      if (!can(ctx, "billing.manage")) return notFound;
      const inv = await prisma.invoice.findFirst({ where: { id, tenantId: ctx.tenantId } });
      if (!inv) return notFound;
      const [tenant, company] = await Promise.all([
        prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } }),
        prisma.company.findFirst({ where: { tenantId: ctx.tenantId, isDefault: true } }),
      ]);
      const plan = PLANS[inv.plan as PlanKey] ?? PLANS.GROWTH;
      const bytes = await invoicePdf({
        number: inv.number,
        issuedAt: inv.issuedAt,
        paidAt: inv.paidAt ?? (inv.status === "PAID" ? inv.issuedAt : null),
        status: inv.status,
        customer: { name: company?.name ?? tenant.name, address: company?.address ?? null, regNo: company?.regNo ?? null },
        plan: plan.name,
        cycle: inv.cycle,
        seats: inv.seats,
        unitPrice: plan.price,
        amount: inv.amount,
        sst: inv.sst,
        paymentRef: inv.paymentRef,
      });
      return pdf(bytes, `${inv.number}.pdf`, download);
    }

    if (kind === "ea") {
      const year = Number(req.nextUrl.searchParams.get("year") ?? new Date().getFullYear());
      const ea = await eaForm(ctx, id, year); // enforces own-or-tax.manage
      const company = await prisma.company.findFirst({ where: { tenantId: ctx.tenantId, name: ea.employer.name } });
      const bytes = await eaPdf(ea, company?.letterheadFooter);
      return pdf(bytes, `Borang EA ${year} - ${ea.employee.name}.pdf`, download);
    }
  } catch (e) {
    if (e instanceof DomainError) return e.code === "FORBIDDEN" ? notFound : NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
  return NextResponse.json({ error: "Unknown document" }, { status: 400 });
}
