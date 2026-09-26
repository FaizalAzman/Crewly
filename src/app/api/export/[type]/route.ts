import { NextResponse, type NextRequest } from "next/server";
import { getCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { toCsv, fmtDate } from "@/lib/utils";
import { bankFile, cp39File, epfFile, socsoEisFile } from "@/lib/payroll/statutory-files";
import { slipRows, cp8d } from "@/server/services/tax.service";
import { audit } from "@/server/guard";
import { IMPORT_COLUMNS } from "@/server/services/import.service";

function csv(body: string, filename: string) {
  return new NextResponse(body, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"` },
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { type } = await params;
  const sp = req.nextUrl.searchParams;

  if (type === "employee-template") {
    if (!can(ctx, "employee.manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return csv(
      toCsv([
        [...IMPORT_COLUMNS],
        ["Aina binti Yusof", "aina@company.my", "950607-10-5432", "", "CITIZEN", "FEMALE", "MALAY", "ISLAM", "SINGLE", "", "Marketing Executive", "MKT", "", "", "PERMANENT", "2026-10-01", "3", "", "4200", "+60 12-345 6789", "Maybank", "112233445566", "", "", ""],
      ]),
      "employee-import-template.csv",
    );
  }

  if (type === "employees") {
    if (!can(ctx, "employee.sensitive")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const rows = await prisma.employee.findMany({
      where: { tenantId: ctx.tenantId, ...(sp.get("status") && sp.get("status") !== "ALL" && sp.get("status") !== "CURRENT" ? { status: sp.get("status")! } : {}) },
      include: { department: true, company: true, branch: true, manager: true },
      orderBy: { employeeNo: "asc" },
    });
    await audit(ctx, "EXPORT", "Employee", null, `Exported ${rows.length} employee records (contains personal data — PDPA)`);
    return csv(
      toCsv([
        ["Employee No", "Full Name", "Email", "Phone", "NRIC", "Passport", "DOB", "Gender", "Race", "Religion", "Citizenship", "Marital", "Company", "Branch", "Department", "Job Title", "Manager", "Type", "Status", "Join Date", "Basic Salary", "Bank", "Account", "EPF No", "SOCSO No", "Tax No"],
        ...rows.map((e) => [
          e.employeeNo, e.fullName, e.email, e.phone, e.icNo, e.passportNo, fmtDate(e.dateOfBirth, "iso"), e.gender, e.race, e.religion, e.citizenship, e.maritalStatus,
          e.company.name, e.branch?.name, e.department?.name, e.jobTitle, e.manager?.fullName, e.employmentType, e.status, fmtDate(e.joinDate, "iso"), e.basicSalary,
          e.bankName, e.bankAccountNo, e.epfNo, e.socsoNo, e.taxNo,
        ]),
      ]),
      `employees-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  }

  if (["epf", "socso", "cp39", "bank"].includes(type)) {
    if (!can(ctx, "payroll.manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const run = await prisma.payrollRun.findFirst({ where: { id: sp.get("runId") ?? "", tenantId: ctx.tenantId }, include: { company: true } });
    if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
    const rows = await slipRows(ctx, run.id);
    const tag = `${run.company.name.split(" ")[0].toLowerCase()}-${run.period}`;
    await audit(ctx, "EXPORT", "PayrollRun", run.id, `Downloaded ${type.toUpperCase()} file for ${run.period}`);
    if (type === "epf") return csv(epfFile(rows, run.company.epfNo ?? "", run.period), `kwsp-borang-a-${tag}.csv`);
    if (type === "socso") return csv(socsoEisFile(rows, run.company.socsoNo ?? "", run.period), `perkeso-socso-eis-${tag}.csv`);
    if (type === "cp39") return csv(cp39File(rows, run.company.taxNo ?? "", run.period), `lhdn-cp39-${tag}.csv`);
    return csv(bankFile(rows, run.period), `bank-payment-${tag}.csv`);
  }

  if (type === "cp8d") {
    if (!can(ctx, "tax.manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const year = Number(sp.get("year") ?? new Date().getFullYear());
    const companyId = sp.get("companyId") ?? "";
    const rows = await cp8d(ctx, companyId, year);
    return csv(
      toCsv([
        ["Name", "Employee No", "NRIC", "Tax No", "Total Gross (B1–B4)", "EPF (E1)", "SOCSO+EIS (E2)", "PCB (D1)", "Zakat (D3)", "Months"],
        ...rows.map((r) => [r.employee.name, r.employee.employeeNo, r.employee.icNo, r.employee.taxNo, r.totalIncome.toFixed(2), r.E1.toFixed(2), r.E2.toFixed(2), r.D1.toFixed(2), r.D3.toFixed(2), r.months]),
      ]),
      `cp8d-${year}.csv`,
    );
  }

  return NextResponse.json({ error: "Unknown export" }, { status: 400 });
}
