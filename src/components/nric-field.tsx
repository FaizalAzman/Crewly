"use client";

import { useState } from "react";
import { parseNric } from "@/lib/nric";
import { inputClass } from "./ui";
import { stateName } from "@/lib/constants";

/** MyKad input that fills date of birth & gender in the surrounding form. */
export function NricField({ defaultValue }: { defaultValue?: string | null }) {
  const [hint, setHint] = useState<string | null>(null);
  return (
    <>
      <input
        name="icNo"
        defaultValue={defaultValue ?? ""}
        placeholder="900101-14-5678"
        className={inputClass}
        onBlur={(e) => {
          const info = parseNric(e.target.value);
          if (!e.target.value) return setHint(null);
          if (!info.valid) return setHint("⚠️ Doesn't look like a valid MyKad number");
          e.target.value = info.normalized;
          const form = e.target.form;
          const dob = form?.elements.namedItem("dateOfBirth") as HTMLInputElement | null;
          const gender = form?.elements.namedItem("gender") as HTMLSelectElement | null;
          if (dob && info.dateOfBirth) dob.value = info.dateOfBirth.toISOString().slice(0, 10);
          if (gender && info.gender) gender.value = info.gender;
          setHint(`✓ Born ${info.dateOfBirth?.toISOString().slice(0, 10)} · ${info.gender?.toLowerCase()} · ${info.birthState ? stateName(info.birthState) : "born overseas"}`);
        }}
      />
      {hint && <span className="mt-1 block text-[11px] font-semibold text-ink-2">{hint}</span>}
    </>
  );
}
