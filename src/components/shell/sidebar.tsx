"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Menu,
  X,
  LayoutDashboard,
  Smile,
  CheckCheck,
  Users,
  Network,
  Magnet,
  Rocket,
  DoorOpen,
  Palmtree,
  CalendarHeart,
  Fingerprint,
  CalendarClock,
  Timer,
  Banknote,
  ListPlus,
  Landmark,
  Receipt,
  Wallet,
  HandCoins,
  TrendingUp,
  HeartPulse,
  Target,
  GraduationCap,
  Gavel,
  ShieldAlert,
  Globe2,
  FileText,
  Laptop,
  PartyPopper,
  LifeBuoy,
  BarChart3,
  Settings,
  Circle,
  Contact,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "../logo";
import { cn } from "@/lib/utils";
import type { NavGroup } from "./nav";

const ICONS: Record<string, LucideIcon> = { LayoutDashboard, Smile, CheckCheck, Users, Network, Magnet, Rocket, DoorOpen, Palmtree, CalendarHeart, Fingerprint, CalendarClock, Timer, Banknote, ListPlus, Landmark, Receipt, Wallet, HandCoins, TrendingUp, HeartPulse, Target, GraduationCap, Gavel, ShieldAlert, Globe2, FileText, Laptop, PartyPopper, LifeBuoy, BarChart3, Settings, Circle, Contact };

export function Sidebar({ groups, badges, tenantName, plan }: { groups: NavGroup[]; badges: Record<string, number>; tenantName: string; plan: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="mb-1.5 px-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted">{g.label}</p>
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const Icon = ICONS[item.icon] ?? Circle;
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const badge = item.badgeKey ? badges[item.badgeKey] : 0;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl border-2 px-3 py-1.5 text-sm font-semibold transition",
                      active ? "border-ink bg-lime shadow-brutal-sm" : "border-transparent hover:border-ink hover:bg-card",
                    )}
                  >
                    <Icon size={16} strokeWidth={2.4} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {badge > 0 && (
                      <span className="rounded-full border-2 border-ink bg-tangerine px-1.5 text-[10px] font-extrabold text-white">{badge}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      <button
        className="no-print fixed left-3 top-3 z-50 rounded-xl border-2 border-ink bg-card p-2 shadow-brutal-sm lg:hidden"
        onClick={() => setOpen((o) => !o)}
        aria-label="Toggle menu"
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>
      {open && <div className="fixed inset-0 z-30 bg-ink/40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside
        className={cn(
          "no-print fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r-2 border-ink bg-paper-2 transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="px-5 pb-4 pt-5">
          <Logo href="/dashboard" />
          <div className="mt-4 rounded-xl border-2 border-ink bg-card px-3 py-2 shadow-brutal-sm">
            <p className="truncate text-sm font-bold">{tenantName}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-grape">{plan} plan</p>
          </div>
        </div>
        {nav}
      </aside>
    </>
  );
}
