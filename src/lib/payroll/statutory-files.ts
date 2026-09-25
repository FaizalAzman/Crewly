/**
 * Formatters for statutory submission files. These produce CSV layouts mirroring the columns required by
 * KWSP i-Akaun (Majikan) Borang A upload, PERKESO ASSIST (SOCSO + EIS) and LHDN e-PCB (CP39).
 * Validate against each portal's current template before live submission.
 */
import { toCsv } from "../utils";

export interface SlipRow {
  employeeNo: string;
  fullName: string;
  icNo: string | null;
  passportNo: string | null;
  epfNo: string | null;
  socsoNo: string | null;
  taxNo: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  citizenship: string;
  epfWages: number;
  socsoWages: number;
  epfEE: number;
  epfER: number;
  socsoEE: number;
  socsoER: number;
  eisEE: number;
  eisER: number;
  pcb: number;
  zakat: number;
  hrdf: number;
  netPay: number;
  grossPay: number;
}

const idOf = (r: SlipRow) => (r.icNo ?? r.passportNo ?? "").replace(/-/g, "");
const mmyyyy = (period: string) => `${period.slice(5, 7)}${period.slice(0, 4)}`;

export function epfFile(rows: SlipRow[], employerNo: string, period: string) {
  return toCsv([
    ["EMPLOYER_NO", "CONTRIBUTION_MONTH", "MEMBER_NO", "IC_NO", "NAME", "WAGES", "EMPLOYER_SHARE", "EMPLOYEE_SHARE"],
    ...rows
      .filter((r) => r.epfEE + r.epfER > 0)
      .map((r) => [employerNo, mmyyyy(period), r.epfNo ?? "", idOf(r), r.fullName.toUpperCase(), r.epfWages.toFixed(2), r.epfER.toFixed(2), r.epfEE.toFixed(2)]),
  ]);
}

export function socsoEisFile(rows: SlipRow[], employerCode: string, period: string) {
  return toCsv([
    ["EMPLOYER_CODE", "MONTH", "IC_NO", "NAME", "WAGES", "SOCSO_EMPLOYER", "SOCSO_EMPLOYEE", "EIS_EMPLOYER", "EIS_EMPLOYEE", "TOTAL"],
    ...rows
      .filter((r) => r.socsoER + r.socsoEE + r.eisER + r.eisEE > 0)
      .map((r) => [
        employerCode,
        mmyyyy(period),
        idOf(r),
        r.fullName.toUpperCase(),
        Math.min(r.socsoWages, 6000).toFixed(2),
        r.socsoER.toFixed(2),
        r.socsoEE.toFixed(2),
        r.eisER.toFixed(2),
        r.eisEE.toFixed(2),
        (r.socsoER + r.socsoEE + r.eisER + r.eisEE).toFixed(2),
      ]),
  ]);
}

export function cp39File(rows: SlipRow[], employerTaxNo: string, period: string) {
  return toCsv([
    ["EMPLOYER_E_NO", "YEAR", "MONTH", "TAX_NO", "NAME", "IC_NO", "PASSPORT_NO", "COUNTRY", "PCB_AMOUNT", "CP38_AMOUNT", "EMPLOYEE_NO"],
    ...rows
      .filter((r) => r.pcb > 0)
      .map((r) => [
        employerTaxNo,
        period.slice(0, 4),
        period.slice(5, 7),
        r.taxNo ?? "",
        r.fullName.toUpperCase(),
        (r.icNo ?? "").replace(/-/g, ""),
        r.passportNo ?? "",
        r.citizenship === "FOREIGNER" ? "" : "MY",
        r.pcb.toFixed(2),
        "0.00",
        r.employeeNo,
      ]),
  ]);
}

export function bankFile(rows: SlipRow[], period: string) {
  return toCsv([
    ["PAYMENT_REF", "BENEFICIARY_NAME", "BANK", "ACCOUNT_NO", "AMOUNT", "ID_NO"],
    ...rows.filter((r) => r.netPay > 0).map((r) => [`SAL${period.replace("-", "")}${r.employeeNo}`, r.fullName.toUpperCase(), r.bankName ?? "", r.bankAccountNo ?? "", r.netPay.toFixed(2), idOf(r)]),
  ]);
}

export function summarize(rows: SlipRow[]) {
  const s = (k: keyof SlipRow) => Math.round(rows.reduce((a, r) => a + (r[k] as number), 0) * 100) / 100;
  return {
    headcount: rows.length,
    epfEE: s("epfEE"),
    epfER: s("epfER"),
    socsoEE: s("socsoEE"),
    socsoER: s("socsoER"),
    eisEE: s("eisEE"),
    eisER: s("eisER"),
    pcb: s("pcb"),
    zakat: s("zakat"),
    hrdf: s("hrdf"),
    net: s("netPay"),
    gross: s("grossPay"),
  };
}
