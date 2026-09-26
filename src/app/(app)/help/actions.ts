"use server";

import { act } from "@/server/action";
import { requireCtx } from "@/server/context";
import { dismissGuide } from "@/server/services/guide.service";
import type { ActionState } from "@/server/types";

/** Hides the "Getting started" checklist for this user (the guides stay at /help). */
export async function dismissGuideAction(_: ActionState, _fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  return act(
    async () => {
      await dismissGuide(ctx);
      return "Hidden. The guides are always under Help & guides.";
    },
    ["/me", "/dashboard"],
    { allowReadOnly: true },
  );
}
