/**
 * Who may open printable documents. The same loaders gate the on-screen print routes (turned into PDFs by
 * Chromium) and the pdfkit fallback, so these rules hold for every PDF.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { eaYear, loadEa, loadInvoice, loadPayslip } from "@/server/documents";
import { approvePayrollRun, calculatePayrollRun, createPayrollRun, markPayrollPaid } from "@/server/services/payroll.service";
import { D, makeWorld, type World } from "./factory";

describe("Printable documents", () => {
  let w: World;
  let slipId: string;
  let runId: string;
  beforeAll(async () => {
    w = await makeWorld();
    const run = await createPayrollRun(w.payroll, { companyId: w.companyId, period: "2026-04", payDate: D("2026-04-28") });
    runId = run.id;
    await calculatePayrollRun(w.payroll, run.id);
    slipId = (await prisma.payslip.findFirstOrThrow({ where: { runId: run.id, employeeId: w.employeeId } })).id;
  });

  it("an employee sees their own payslip only once payroll is paid; payroll sees it any time", async () => {
    expect(await loadPayslip(w.employee, slipId)).toBeNull();
    expect(await loadPayslip(w.payroll, slipId)).not.toBeNull();
    await approvePayrollRun(w.hr, runId);
    await markPayrollPaid(w.hr, runId);
    expect((await loadPayslip(w.employee, slipId))?.id).toBe(slipId);
  });

  it("nobody else's payslip, and nothing from another workspace", async () => {
    const colleague = await w.emp({}, { login: "EMPLOYEE" });
    expect(await loadPayslip(colleague.ctx!, slipId)).toBeNull();
    const other = await makeWorld();
    expect(await loadPayslip(other.payroll, slipId)).toBeNull();
  });

  it("Form EA: your own, or with tax.manage", async () => {
    const colleague = await w.emp({}, { login: "EMPLOYEE" });
    expect(await loadEa(w.employee, w.employeeId, 2026)).not.toBeNull();
    expect(await loadEa(colleague.ctx!, w.employeeId, 2026)).toBeNull();
    expect(await loadEa(w.payroll, w.employeeId, 2026)).not.toBeNull();
  });

  it("invoices are for billing managers only", async () => {
    const inv = await prisma.invoice.create({ data: { tenantId: w.tenantId, number: "INV-TEST-1", period: "2026-04", seats: 10, amount: 120, sst: 9.6 } });
    expect(await loadInvoice(w.employee, inv.id)).toBeNull();
    expect(await loadInvoice(w.hr, inv.id)).toBeNull();
    expect((await loadInvoice(w.owner, inv.id))?.invoice.number).toBe("INV-TEST-1");
  });

  it("the EA year is sanitised", () => {
    expect(eaYear("2025")).toBe(2025);
    expect(eaYear("abc")).toBe(new Date().getFullYear());
    expect(eaYear("1999")).toBe(new Date().getFullYear());
  });
});
