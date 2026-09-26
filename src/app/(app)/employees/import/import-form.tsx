"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { btnClass, inputClass } from "@/components/ui";
import type { ActionState } from "@/components/forms";
import { importAction } from "./actions";

type Result = { row: number; name: string; ok: boolean; error?: string; employeeNo?: string };

function Buttons() {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap gap-2">
      <button name="mode" value="validate" disabled={pending} className={btnClass("secondary")}>
        {pending ? "Working…" : "1. Validate only"}
      </button>
      <button name="mode" value="import" disabled={pending} className={btnClass("primary")}>
        {pending ? "Working…" : "2. Import"}
      </button>
    </div>
  );
}

export function ImportForm() {
  const [state, action] = useActionState<ActionState, FormData>(importAction, null);
  const data = state?.data as { results: Result[]; dryRun: boolean } | undefined;
  return (
    <div className="space-y-5">
      <form action={action} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-2">CSV file</span>
          <input type="file" name="file" accept=".csv,text/csv" className={`${inputClass} py-1.5`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-2">…or paste CSV</span>
          <textarea name="csv" rows={6} className={`${inputClass} h-auto py-2 font-mono text-xs`} placeholder="fullName,email,icNo,jobTitle,joinDate,basicSalary" />
        </label>
        <Buttons />
      </form>
      {state && !state.ok && <p className="rounded-xl border-2 border-ink bg-cherry/15 px-3 py-2 text-sm font-semibold text-cherry">⚠️ {state.error}</p>}
      {state?.ok && <p className="rounded-xl border-2 border-ink bg-lime px-3 py-2 text-sm font-bold">{state.message}</p>}
      {data && (
        <div className="overflow-x-auto rounded-2xl border-2 border-ink">
          <table className="w-full text-sm">
            <thead className="bg-paper-2 text-left text-[11px] uppercase">
              <tr>
                <th className="px-3 py-2">Row</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Result</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((r) => (
                <tr key={r.row} className={`border-t border-soft-line ${r.ok ? "" : "bg-cherry/10"}`}>
                  <td className="px-3 py-2 font-mono text-xs">{r.row}</td>
                  <td className="px-3 py-2 font-semibold">{r.name}</td>
                  <td className="px-3 py-2 text-xs">{r.ok ? (data.dryRun ? "✅ Ready" : `✅ Imported as ${r.employeeNo}`) : `❌ ${r.error}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
