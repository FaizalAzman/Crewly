"use client";

import { useMemo, useState } from "react";
import { calcEpf, type Citizenship } from "@/lib/statutory/epf";
import { calcEis, calcSocso } from "@/lib/statutory/socso";
import { calcPcb, pcbCategory } from "@/lib/statutory/pcb";
import { inputClass } from "./ui";

const fmt = (n: number) => `RM${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Interactive take-home calculator using the same statutory engines as payroll. */
export function SalaryCalculator() {
  const [salary, setSalary] = useState(5000);
  const [bonus, setBonus] = useState(0);
  const [age, setAge] = useState(30);
  const [cit, setCit] = useState<Citizenship>("CITIZEN");
  const [marital, setMarital] = useState("SINGLE");
  const [spouseWorking, setSpouseWorking] = useState(false);
  const [kids, setKids] = useState(0);
  const [month, setMonth] = useState(1);
  const [resident, setResident] = useState(true);
  const [zakat, setZakat] = useState(0);

  const r = useMemo(() => {
    const epfAll = calcEpf({ wages: salary + bonus, age, citizenship: cit });
    const epfN = calcEpf({ wages: salary, age, citizenship: cit });
    const socso = calcSocso({ wages: salary, age, citizenship: cit });
    const eis = calcEis({ wages: salary, age, citizenship: cit });
    const pcb = calcPcb({
      month,
      resident,
      category: pcbCategory(marital, spouseWorking, kids),
      childRelief: kids * 2000,
      Y: 0,
      K: 0,
      Y1: salary,
      K1: epfN.employee,
      Yt: bonus,
      Kt: Math.max(0, epfAll.employee - epfN.employee),
      LP1: socso.employee + eis.employee,
      zakatCurrent: zakat,
    });
    const deductions = epfAll.employee + socso.employee + eis.employee + pcb.netPayable + zakat;
    return { epf: epfAll, socso, eis, pcb, net: salary + bonus - deductions, cost: salary + bonus + epfAll.employer + socso.employer + eis.employer };
  }, [salary, bonus, age, cit, marital, spouseWorking, kids, month, resident, zakat]);

  const L = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-2">{label}</span>
      {children}
    </label>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="grid grid-cols-2 gap-4 rounded-3xl border-2 border-ink bg-card p-6 shadow-brutal">
        <L label="Monthly salary (RM)">
          <input type="number" className={inputClass} value={salary} onChange={(e) => setSalary(+e.target.value || 0)} />
        </L>
        <L label="Bonus this month (RM)">
          <input type="number" className={inputClass} value={bonus} onChange={(e) => setBonus(+e.target.value || 0)} />
        </L>
        <L label="Age">
          <input type="number" className={inputClass} value={age} onChange={(e) => setAge(+e.target.value || 0)} />
        </L>
        <L label="Citizenship">
          <select className={inputClass} value={cit} onChange={(e) => setCit(e.target.value as Citizenship)}>
            <option value="CITIZEN">Malaysian</option>
            <option value="PR">Permanent resident</option>
            <option value="FOREIGNER">Foreigner</option>
          </select>
        </L>
        <L label="Marital status">
          <select className={inputClass} value={marital} onChange={(e) => setMarital(e.target.value)}>
            <option value="SINGLE">Single</option>
            <option value="MARRIED">Married</option>
            <option value="DIVORCED">Divorced / widowed</option>
          </select>
        </L>
        <L label="Children (under 18)">
          <input type="number" min={0} className={inputClass} value={kids} onChange={(e) => setKids(+e.target.value || 0)} />
        </L>
        <L label="Payroll month">
          <select className={inputClass} value={month} onChange={(e) => setMonth(+e.target.value)}>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={i + 1}>
                {new Date(2026, i, 1).toLocaleString("en", { month: "long" })}
              </option>
            ))}
          </select>
        </L>
        <L label="Zakat / month (RM)">
          <input type="number" className={inputClass} value={zakat} onChange={(e) => setZakat(+e.target.value || 0)} />
        </L>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={spouseWorking} onChange={(e) => setSpouseWorking(e.target.checked)} disabled={marital !== "MARRIED"} /> Spouse working
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={resident} onChange={(e) => setResident(e.target.checked)} /> Tax resident
        </label>
      </div>
      <div className="rounded-3xl border-2 border-ink bg-lime p-6 shadow-brutal">
        <p className="text-xs font-bold uppercase tracking-wider">Estimated take-home</p>
        <p className="font-display tabular text-5xl font-extrabold">{fmt(r.net)}</p>
        <div className="mt-5 space-y-2 rounded-2xl border-2 border-ink bg-card p-4 text-sm">
          {[
            [`EPF employee (${r.epf.employeeRate}%)`, r.epf.employee],
            [`SOCSO (${r.socso.category === "FOREIGN" ? "EI only" : `cat. ${r.socso.category}`})`, r.socso.employee],
            ["EIS", r.eis.employee],
            [`PCB (normal ${fmt(r.pcb.normal)}${r.pcb.additional ? ` + bonus ${fmt(r.pcb.additional)}` : ""})`, r.pcb.netPayable],
            ["Zakat", zakat],
          ].map(([l, v]) => (
            <div key={String(l)} className="flex justify-between">
              <span>{l}</span>
              <span className="font-mono font-semibold">−{fmt(Number(v))}</span>
            </div>
          ))}
          <div className="border-t-2 border-dashed border-soft-line pt-2 text-xs text-muted">
            Employer pays EPF {fmt(r.epf.employer)} ({r.epf.employerRate}%), SOCSO {fmt(r.socso.employer)}, EIS {fmt(r.eis.employer)}. Total cost to company: <b className="text-ink">{fmt(r.cost)}</b>
          </div>
          <div className="text-xs text-muted">
            Projected chargeable income {fmt(r.pcb.chargeableIncome)} · estimated annual tax {fmt(r.pcb.estimatedAnnualTax)}
          </div>
        </div>
      </div>
    </div>
  );
}
