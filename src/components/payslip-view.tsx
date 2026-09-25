import type { Company, Employee, Payslip, PayslipLine, PayrollRun, Department } from "@prisma/client";
import { fmtDate, periodLabel, rm } from "@/lib/utils";
import { Logo } from "./logo";

type Full = Payslip & { lines: PayslipLine[]; run: PayrollRun & { company: Company }; employee: Employee & { department: Department | null } };

export function PayslipView({ slip }: { slip: Full }) {
  const earnings = slip.lines.filter((l) => l.kind === "EARNING");
  const deductions = slip.lines.filter((l) => l.kind === "DEDUCTION");
  const employer = slip.lines.filter((l) => l.kind === "EMPLOYER");
  const e = slip.employee;
  return (
    <div className="print-plain mx-auto max-w-3xl rounded-3xl border-2 border-ink bg-card p-8 shadow-brutal-lg">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-ink pb-5">
        <div>
          <p className="font-display text-xl font-extrabold">{slip.run.company.name}</p>
          <p className="text-xs text-muted">{slip.run.company.regNo}</p>
          <p className="max-w-xs text-xs text-muted">{slip.run.company.address}</p>
        </div>
        <div className="text-right">
          <p className="inline-block rounded-lg border-2 border-ink bg-lime px-3 py-1 font-display text-sm font-extrabold">PAYSLIP</p>
          <p className="mt-2 font-display text-lg font-bold">{periodLabel(slip.period)}</p>
          <p className="text-xs text-muted">Paid on {fmtDate(slip.run.payDate, "long")}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2 border-b-2 border-dashed border-soft-line py-4 text-sm md:grid-cols-3">
        <Info label="Name" value={e.fullName} />
        <Info label="Employee no." value={e.employeeNo} />
        <Info label="NRIC / passport" value={e.icNo ?? e.passportNo ?? "-"} />
        <Info label="Position" value={e.jobTitle} />
        <Info label="Department" value={e.department?.name ?? "-"} />
        <Info label="Bank" value={`${e.bankName ?? "-"} ${e.bankAccountNo ? `· ${e.bankAccountNo}` : ""}`} />
        <Info label="EPF no." value={e.epfNo ?? "-"} />
        <Info label="SOCSO no." value={e.socsoNo ?? "-"} />
        <Info label="Tax no." value={e.taxNo ?? "-"} />
        <Info label="Days paid" value={`${slip.daysPaid} / ${slip.workingDays}`} />
      </div>

      <div className="grid gap-6 py-5 md:grid-cols-2">
        <Section title="Earnings" rows={earnings} total={slip.grossPay} totalLabel="Gross pay" />
        <Section title="Deductions" rows={deductions} total={slip.totalDeductions} totalLabel="Total deductions" />
      </div>

      <div className="flex items-center justify-between rounded-2xl border-2 border-ink bg-grape px-5 py-4 text-white">
        <span className="font-display text-lg font-bold">Net pay</span>
        <span className="font-display tabular text-3xl font-extrabold">{rm(slip.netPay)}</span>
      </div>

      <div className="mt-5 rounded-2xl border-2 border-dashed border-soft-line p-4">
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Employer contributions (not deducted from you)</p>
        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          {employer.map((l) => (
            <div key={l.id}>
              <p className="text-xs text-muted">{l.name}</p>
              <p className="font-mono font-semibold">{rm(l.amount)}</p>
            </div>
          ))}
        </div>
      </div>
      {slip.warnings && <p className="no-print mt-4 rounded-xl border-2 border-ink bg-sunny px-3 py-2 text-xs font-semibold">⚠️ {slip.warnings}</p>}
      <div className="mt-6 flex items-center justify-between border-t-2 border-ink pt-4 text-[11px] text-muted">
        <span>This is a computer-generated payslip. No signature is required.</span>
        <span className="scale-75">
          <Logo href="#" />
        </span>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

function Section({ title, rows, total, totalLabel }: { title: string; rows: PayslipLine[]; total: number; totalLabel: string }) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">{title}</p>
      <div className="space-y-1.5 text-sm">
        {rows.map((l) => (
          <div key={l.id} className="flex justify-between gap-3">
            <span>{l.name}</span>
            <span className={`font-mono ${l.amount < 0 ? "text-cherry" : ""}`}>{rm(l.amount)}</span>
          </div>
        ))}
        {rows.length === 0 && <p className="text-muted">None</p>}
      </div>
      <div className="mt-3 flex justify-between border-t-2 border-ink pt-2 text-sm font-bold">
        <span>{totalLabel}</span>
        <span className="font-mono">{rm(total)}</span>
      </div>
    </div>
  );
}
