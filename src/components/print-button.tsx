"use client";

import { Printer } from "lucide-react";
import { btnClass } from "./ui";

export function PrintButton({ label = "Print / Save PDF" }: { label?: string }) {
  return (
    <button onClick={() => window.print()} className={btnClass("primary")}>
      <Printer size={15} /> {label}
    </button>
  );
}
