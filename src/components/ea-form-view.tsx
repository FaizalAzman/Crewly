import type { EaForm } from "@/server/services/tax.service";
import { fmtDate, rm } from "@/lib/utils";

export function EaFormView({ ea }: { ea: EaForm }) {
  const Row = ({ code, label, value, strong }: { code: string; label: string; value: number; strong?: boolean }) => (
    <tr className={`border-b border-soft-line ${strong ? "font-bold" : ""}`}>
      <td className="w-14 py-2 font-mono text-xs text-muted">{code}</td>
      <td className="py-2 text-sm">{label}</td>
      <td className="py-2 text-right font-mono text-sm">{rm(value)}</td>
    </tr>
  );
  return (
    <div className="print-plain rounded-3xl border-2 border-ink bg-card p-7 shadow-brutal">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-ink pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Borang EA (C.P.8A) · Penyata Saraan daripada Penggajian</p>
          <p className="font-display text-2xl font-extrabold">Statement of Remuneration · {ea.year}</p>
        </div>
        <span className="rounded-lg border-2 border-ink bg-sunny px-2 py-1 text-xs font-bold">{ea.months} month(s) of payroll</span>
      </div>
      <div className="grid gap-4 border-b-2 border-dashed border-soft-line py-4 text-sm md:grid-cols-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">A. Employee</p>
          <p className="font-semibold">{ea.employee.name}</p>
          <p className="text-xs text-ink-2">
            NRIC {ea.employee.icNo ?? "-"} · Tax no. {ea.employee.taxNo ?? "-"}
            <br />
            EPF {ea.employee.epfNo ?? "-"} · SOCSO {ea.employee.socsoNo ?? "-"}
            <br />
            {ea.employee.jobTitle} · Staff no. {ea.employee.employeeNo}
            <br />
            Employed from {fmtDate(ea.employee.joinDate, "long")}
            {ea.employee.lastWorkingDate ? ` to ${fmtDate(ea.employee.lastWorkingDate, "long")}` : ""}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Employer</p>
          <p className="font-semibold">{ea.employer.name}</p>
          <p className="text-xs text-ink-2">
            E no. {ea.employer.taxNo ?? "-"}
            <br />
            {ea.employer.address}
          </p>
        </div>
      </div>
      <table className="mt-3 w-full">
        <tbody>
          <tr>
            <td colSpan={3} className="pt-2 text-xs font-bold uppercase tracking-wider text-muted">B. Employment income, benefits and living accommodation</td>
          </tr>
          <Row code="B1(a)" label="Gross salary, wages or leave pay (including overtime)" value={ea.B1a} />
          <Row code="B1(b)" label="Fees, commission or bonus" value={ea.B1b} />
          <Row code="B1(c)" label="Gross tips, perquisites, allowances" value={ea.B1c} />
          <Row code="B1(d)" label="Income tax borne by the employer" value={ea.B1d} />
          <Row code="B2" label="Compensation for loss of employment" value={ea.B2} />
          <Row code="B3" label="Benefits in kind" value={ea.B3} />
          <Row code="B4" label="Value of living accommodation" value={ea.B4} />
          <Row code="" label="TOTAL" value={ea.totalIncome} strong />
          <tr>
            <td colSpan={3} className="pt-4 text-xs font-bold uppercase tracking-wider text-muted">D. Total deductions</td>
          </tr>
          <Row code="D1" label="Monthly tax deductions (MTD / PCB) remitted to LHDN" value={ea.D1} />
          <Row code="D2" label="CP38 deductions" value={ea.D2} />
          <Row code="D3" label="Zakat paid via salary deduction" value={ea.D3} />
          <tr>
            <td colSpan={3} className="pt-4 text-xs font-bold uppercase tracking-wider text-muted">E. Contributions paid by employee</td>
          </tr>
          <Row code="E1" label="Employees Provident Fund (KWSP)" value={ea.E1} />
          <Row code="E2" label="SOCSO & EIS (PERKESO)" value={ea.E2} />
        </tbody>
      </table>
      <p className="mt-4 text-[11px] text-muted">Generated from finalised payroll. Employers must issue Form EA by the last day of February of the following year.</p>
    </div>
  );
}
