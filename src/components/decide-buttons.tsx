"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "./forms";
import { btnClass } from "./ui";
import { decideAction } from "@/app/(app)/approvals/actions";

/** Approve / reject pair; reject opens an inline reason box. */
export function DecideButtons({ kind, id, requireReason = true }: { kind: string; id: string; requireReason?: boolean }) {
  const [rejecting, setRejecting] = useState(false);
  if (rejecting) {
    return (
      <ActionForm action={decideAction} className="flex items-center gap-1.5" resetOnSuccess={false}>
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="decision" value="reject" />
        <input name="note" required={requireReason} placeholder="Reason…" className="h-8 w-40 rounded-lg border-2 border-ink px-2 text-xs" autoFocus />
        <SubmitButton size="sm" variant="danger" pendingText="…">
          Reject
        </SubmitButton>
        <button type="button" onClick={() => setRejecting(false)} className={btnClass("ghost", "sm")}>
          ✕
        </button>
      </ActionForm>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <ActionForm action={decideAction} className="inline" resetOnSuccess={false}>
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="decision" value="approve" />
        <SubmitButton size="sm" variant="lime" pendingText="…">
          ✓ Approve
        </SubmitButton>
      </ActionForm>
      <button type="button" onClick={() => setRejecting(true)} className={btnClass("secondary", "sm")}>
        ✕
      </button>
    </div>
  );
}
