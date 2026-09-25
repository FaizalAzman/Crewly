"use client";

import { useEffect, useState } from "react";

type Toast = { id: number; message: string; tone: "success" | "error" | "info" };

const listeners = new Set<(t: Toast) => void>();
let counter = 0;

export function toast(message: string, tone: Toast["tone"] = "success") {
  const t = { id: ++counter, message, tone };
  listeners.forEach((l) => l(t));
}

const TONE: Record<Toast["tone"], string> = {
  success: "bg-lime",
  error: "bg-cherry text-white",
  info: "bg-sky",
};
const EMOJI: Record<Toast["tone"], string> = { success: "🎉", error: "🙈", info: "💡" };

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    const add = (t: Toast) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 3800);
    };
    listeners.add(add);
    return () => {
      listeners.delete(add);
    };
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pop-in pointer-events-auto flex max-w-sm items-center gap-2 rounded-xl border-2 border-ink px-4 py-3 text-sm font-semibold shadow-brutal ${TONE[t.tone]}`}
        >
          <span className="text-lg">{EMOJI[t.tone]}</span>
          {t.message}
        </div>
      ))}
    </div>
  );
}
