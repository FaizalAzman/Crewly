"use client";

import { useEffect, useState } from "react";
import { Monitor, X } from "lucide-react";

const KEY = "crewly:mobile-notice-dismissed";

/**
 * Shown on phone-sized screens only. The admin side of an HR system (payroll runs, reports,
 * org charts, wide tables) is built for desktop; self-service works fine on a phone.
 */
export function MobileNotice({ variant = "app" }: { variant?: "app" | "public" }) {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(KEY) === "1";
    } catch {
      /* storage unavailable — show the notice */
    }
    setHidden(dismissed);
  }, []);
  if (hidden) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="no-print mx-3 mt-3 flex items-start gap-3 rounded-2xl border-2 border-ink bg-sunny p-3 text-sm shadow-brutal-sm md:hidden" role="status">
      <Monitor size={20} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-bold">Best on a bigger screen</p>
        <p className="mt-0.5 text-ink-2">
          {variant === "app"
            ? "Payroll runs, reports and wide tables are designed for desktop or tablet. On your phone, stick to the Me page: clock in, apply for leave, submit claims and view payslips."
            : "Crewly is an HR back-office tool built for desktop. You can browse here, but for real work, open it on a laptop."}
        </p>
      </div>
      <button onClick={dismiss} aria-label="Dismiss" className="rounded-lg border-2 border-ink bg-card p-1">
        <X size={14} />
      </button>
    </div>
  );
}
