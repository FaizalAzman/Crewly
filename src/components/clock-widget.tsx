"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { MapPin } from "lucide-react";
import { btnClass } from "./ui";
import { toast } from "./toast";
import type { ActionState } from "./forms";

export function ClockWidget({
  clockedIn,
  clockedOut,
  inAt,
  outAt,
  clockInAction,
  clockOutAction,
}: {
  clockedIn: boolean;
  clockedOut: boolean;
  inAt: string | null;
  outAt: string | null;
  clockInAction: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  clockOutAction: () => Promise<ActionState>;
}) {
  const [now, setNow] = useState<Date | null>(null);
  const [locating, setLocating] = useState(false);
  const [pending, start] = useTransition();
  const [state, formAction] = useActionState(clockInAction, null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (state?.ok) toast(state.message ?? "Done");
    else if (state?.error) toast(state.error, "error");
  }, [state]);

  const doClockIn = () => {
    setLocating(true);
    const submit = (lat?: number, lng?: number) => {
      const fd = new FormData();
      if (lat !== undefined) fd.set("lat", String(lat));
      if (lng !== undefined) fd.set("lng", String(lng));
      fd.set("source", /Mobi/.test(navigator.userAgent) ? "MOBILE" : "WEB");
      setLocating(false);
      start(() => formAction(fd));
    };
    if (!navigator.geolocation) return submit();
    navigator.geolocation.getCurrentPosition(
      (p) => submit(p.coords.latitude, p.coords.longitude),
      () => submit(),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const time = now?.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true, timeZone: "Asia/Kuala_Lumpur" }) ?? "--:--:--";

  return (
    <div className="rounded-3xl border-2 border-ink bg-grape p-5 text-white shadow-brutal">
      <p className="text-xs font-bold uppercase tracking-wider text-white/80">Malaysia time</p>
      <p className="font-display tabular mt-1 text-4xl font-extrabold">{time}</p>
      <p className="mt-1 text-sm text-white/80">
        {clockedIn ? `In at ${inAt}` : "Not clocked in yet"}
        {clockedOut && ` · Out at ${outAt}`}
      </p>
      <div className="mt-4">
        {!clockedIn && (
          <button onClick={doClockIn} disabled={pending || locating} className={`${btnClass("lime", "lg")} w-full`}>
            <MapPin size={16} /> {locating ? "Getting location…" : pending ? "Clocking in…" : "Clock in"}
          </button>
        )}
        {clockedIn && !clockedOut && (
          <button
            onClick={() =>
              start(async () => {
                const r = await clockOutAction();
                if (r?.ok) toast(r.message ?? "Clocked out");
                else if (r?.error) toast(r.error, "error");
              })
            }
            disabled={pending}
            className={`${btnClass("secondary", "lg")} w-full`}
          >
            {pending ? "Clocking out…" : "Clock out"}
          </button>
        )}
        {clockedOut && <p className="rounded-xl border-2 border-ink bg-card px-3 py-2 text-center text-sm font-bold text-ink">Done for today 🎉</p>}
      </div>
    </div>
  );
}
