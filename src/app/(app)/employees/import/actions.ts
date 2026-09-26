"use server";

import { act } from "@/server/action";
import { requireCtx } from "@/server/context";
import { importEmployees } from "@/server/services/import.service";
import { DomainError, type ActionState } from "@/server/types";
import { str } from "@/lib/utils";

export async function importAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("employee.manage");
  return act(async () => {
    const file = fd.get("file");
    let csv = str(fd, "csv");
    if (file && typeof file === "object" && (file as File).size > 0) {
      if ((file as File).size > 2 * 1024 * 1024) throw new DomainError("CSV files must be under 2 MB.");
      csv = await (file as File).text();
    }
    if (!csv.trim()) throw new DomainError("Upload a CSV file or paste CSV text.");
    const dryRun = str(fd, "mode") !== "import";
    const results = await importEmployees(ctx, csv, { dryRun });
    const ok = results.filter((r) => r.ok).length;
    return { message: dryRun ? `Validated: ${ok} of ${results.length} rows are ready to import` : `Imported ${ok} of ${results.length} employees`, data: { results, dryRun } };
  }, ["/employees"]);
}
