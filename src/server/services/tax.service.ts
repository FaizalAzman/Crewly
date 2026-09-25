import { prisma } from "@/lib/db";
import { round2 } from "@/lib/utils";
import { assertCan } from "../guard";
import { DomainError, type Ctx } from "../types";
import type { SlipRow } from "@/lib/payroll/statutory-files";

const FINAL = ["APPROVED", "PAID", "LOCKED"];

/** Slip rows for a company-period (finalised or calculated run). */
export async function slipRows(ctx: Ctx, runId: string): Promise<SlipRow[]> {
  const slips = await prisma.payslip.findMany({
    where: { runId, tenantId: ctx.tenantId },
    include: { employee: true },
    orderBy: { employee: { employeeNo: "asc" } },
  });
  return slips.map((s) => ({
    employeeNo: s.employee.employeeNo,
    fullName: s.employee.fullName,
    icNo: s.employee.icNo,
    passportNo: s.employee.passportNo,
    epfNo: s.employee.epfNo,
    socsoNo: s.employee.socsoNo,
    taxNo: s.employee.taxNo,
    bankName: s.employee.bankName,
    bankAccountNo: s.employee.bankAccountNo,
    citizenship: s.employee.citizenship,
    epfWages: s.epfWages,
    socsoWages: s.socsoWages,
    epfEE: s.epfEE,
    epfER: s.epfER,
    socsoEE: s.socsoEE,
    socsoER: s.socsoER,
    eisEE: s.eisEE,
    eisER: s.eisER,
    pcb: s.pcb,
    zakat: s.zakat,
    hrdf: s.hrdf,
    netPay: s.netPay,
    grossPay: s.grossPay,
  }));
}

export interface EaForm {
  year: number;
  employee: { name: string; employeeNo: string; icNo: string | null; taxNo: string | null; epfNo: string | null; socsoNo: string | null; jobTitle: string; joinDate: Date; lastWorkingDate: Date | null };
  employer: { name: string; taxNo: string | null; address: string | null };
  B1a: number; // gross salary, wages, leave pay, OT
  B1b: number; // fees, commission, bonus
  B1c: number; // tips, perquisites, allowances
  B1d: number; // income tax borne by employer
  B2: number; // compensation for loss of employment
  B3: number; // benefits in kind
  B4: number; // value of living accommodation
  totalIncome: number;
  D1: number; // MTD remitted
  D2: number; // CP38
  D3: number; // zakat via salary
  E1: number; // EPF employee
  E2: number; // SOCSO + EIS employee
  months: number;
}

/** Form EA (C.P.8A) — annual statement of remuneration, due to employees by end February. */
export async function eaForm(ctx: Ctx, employeeId: string, year: number): Promise<EaForm> {
  if (ctx.employeeId !== employeeId) assertCan(ctx, "tax.manage");
  const emp = await prisma.employee.findFirst({ where: { id: employeeId, tenantId: ctx.tenantId }, include: { company: true } });
  if (!emp) throw new DomainError("Employee not found.");
  const slips = await prisma.payslip.findMany({
    where: { employeeId, period: { startsWith: `${year}-` }, run: { status: { in: FINAL } } },
    include: { lines: true },
  });
  const items = await prisma.payItem.findMany({ where: { tenantId: ctx.tenantId } });
  const eaOf = new Map(items.map((i) => [i.code, i.eaField]));
  const f = { B1a: 0, B1b: 0, B1c: 0, B1d: 0, B2: 0, B3: 0, B4: 0 };
  for (const s of slips) {
    for (const l of s.lines.filter((x) => x.kind === "EARNING")) {
      if (l.code === "CLAIM") continue; // reimbursements are not income
      const field = l.code === "UNPAID" || l.code === "BASIC" || l.code === "OT" ? "B1a" : l.code === "CLAIM_TAX" ? "B3" : (eaOf.get(l.code) ?? "B1c");
      if (field in f) f[field as keyof typeof f] += l.amount;
    }
  }
  const sum = (k: "pcb" | "zakat" | "epfEE" | "socsoEE" | "eisEE") => round2(slips.reduce((a, s) => a + s[k], 0));
  const r = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, round2(v)])) as typeof f;
  return {
    year,
    employee: {
      name: emp.fullName,
      employeeNo: emp.employeeNo,
      icNo: emp.icNo,
      taxNo: emp.taxNo,
      epfNo: emp.epfNo,
      socsoNo: emp.socsoNo,
      jobTitle: emp.jobTitle,
      joinDate: emp.joinDate,
      lastWorkingDate: emp.lastWorkingDate,
    },
    employer: { name: emp.company.name, taxNo: emp.company.taxNo, address: emp.company.address },
    ...r,
    totalIncome: round2(Object.values(r).reduce((a, b) => a + b, 0)),
    D1: sum("pcb"),
    D2: 0,
    D3: sum("zakat"),
    E1: sum("epfEE"),
    E2: round2(sum("socsoEE") + sum("eisEE")),
    months: slips.length,
  };
}

/** CP8D — employer's annual return of all employees' remuneration (accompanies Form E). */
export async function cp8d(ctx: Ctx, companyId: string, year: number) {
  assertCan(ctx, "tax.manage");
  const employees = await prisma.employee.findMany({
    where: { tenantId: ctx.tenantId, companyId, payslips: { some: { period: { startsWith: `${year}-` } } } },
    orderBy: { employeeNo: "asc" },
  });
  const rows = [];
  for (const e of employees) rows.push(await eaForm(ctx, e.id, year));
  return rows;
}

/** Declarations (TP1 reliefs + TP3 prior employment) for an employee-year. */
export async function saveTaxDeclaration(ctx: Ctx, employeeId: string, year: number, data: Record<string, number>) {
  if (ctx.employeeId !== employeeId) assertCan(ctx, "tax.manage");
  for (const [k, v] of Object.entries(data)) if (v < 0) throw new DomainError(`${k} can't be negative.`);
  const locked = await prisma.payslip.count({ where: { employeeId, period: { startsWith: `${year}-12` }, run: { status: { in: FINAL } } } });
  if (locked) throw new DomainError(`December ${year} payroll is finalised — declarations for ${year} are closed.`);
  return prisma.taxDeclaration.upsert({
    where: { employeeId_year: { employeeId, year } },
    update: data,
    create: { employeeId, year, ...data },
  });
}
