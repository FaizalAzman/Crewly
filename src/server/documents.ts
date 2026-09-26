import "server-only";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { readableLetter } from "./services/culture.service";
import { eaForm } from "./services/tax.service";
import { PLANS, type PlanKey } from "./services/subscription.service";
import { DomainError, type Ctx } from "./types";

/**
 * Loaders for printable documents, shared by the on-screen print routes (which Chromium turns into PDFs) and
 * the pdfkit fallback. Each returns null when the document doesn't exist or the actor may not see it, so
 * callers answer "not found" without revealing which.
 */

export const DOCUMENT_KINDS = ["payslip", "letter", "ea", "invoice"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** Payslips: payroll managers see any; employees see their own once the run is paid. */
export async function loadPayslip(ctx: Ctx, id: string) {
  const slip = await prisma.payslip.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { lines: { orderBy: { sortOrder: "asc" } }, run: { include: { company: true } }, employee: { include: { department: true } } },
  });
  if (!slip) return null;
  const own = slip.employeeId === ctx.employeeId && ["PAID", "LOCKED"].includes(slip.run.status);
  return own || can(ctx, "payroll.manage") ? slip : null;
}
export type PayslipDoc = NonNullable<Awaited<ReturnType<typeof loadPayslip>>>;

/** Letters: document managers see any; the recipient sees it once issued. */
export async function loadLetter(ctx: Ctx, id: string) {
  return readableLetter(ctx, id);
}
export type LetterDoc = NonNullable<Awaited<ReturnType<typeof loadLetter>>>;

/** Form EA: the employee themselves, or someone with tax.manage. */
export async function loadEa(ctx: Ctx, employeeId: string, year: number) {
  try {
    const ea = await eaForm(ctx, employeeId, year);
    const company = await prisma.company.findFirst({ where: { tenantId: ctx.tenantId, name: ea.employer.name } });
    return { ea, footer: company?.letterheadFooter ?? null };
  } catch (e) {
    if (e instanceof DomainError) return null;
    throw e;
  }
}
export type EaDoc = NonNullable<Awaited<ReturnType<typeof loadEa>>>;

/** Crewly subscription invoices: billing managers only. */
export async function loadInvoice(ctx: Ctx, id: string) {
  if (!can(ctx, "billing.manage")) return null;
  const inv = await prisma.invoice.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!inv) return null;
  const [tenant, company] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } }),
    prisma.company.findFirst({ where: { tenantId: ctx.tenantId, isDefault: true } }),
  ]);
  const plan = PLANS[inv.plan as PlanKey] ?? PLANS.GROWTH;
  return {
    invoice: inv,
    paidAt: inv.paidAt ?? (inv.status === "PAID" ? inv.issuedAt : null),
    customer: { name: company?.name ?? tenant.name, address: company?.address ?? null, regNo: company?.regNo ?? null },
    plan: plan.name,
    unitPrice: plan.price,
  };
}
export type InvoiceDoc = NonNullable<Awaited<ReturnType<typeof loadInvoice>>>;

export const eaYear = (raw: string | null | undefined) => {
  const y = Number(raw ?? new Date().getFullYear());
  return Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : new Date().getFullYear();
};
