"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, LogOut, Search, UserRound } from "lucide-react";
import { Avatar } from "../ui";
import { cn } from "@/lib/utils";

interface Notif {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

function useClickAway(cb: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cb();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [cb]);
  return ref;
}

export function Topbar({
  user,
  notifications,
  markAllRead,
  logout,
  canSearch,
}: {
  user: { name: string; role: string; color: string; email: string };
  notifications: Notif[];
  markAllRead: () => Promise<void>;
  logout: () => Promise<void>;
  canSearch: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [bellOpen, setBellOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const bellRef = useClickAway(() => setBellOpen(false));
  const menuRef = useClickAway(() => setMenuOpen(false));
  const unread = notifications.filter((n) => !n.read).length;
  const [greeting] = useState(() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  });

  return (
    <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-3 border-b-2 border-ink bg-paper/90 px-4 pl-16 backdrop-blur lg:pl-6">
      <p className="hidden font-display text-sm font-bold md:block">
        {greeting}, {user.name.split(" ")[0]}! 👋
      </p>
      <div className="flex-1" />
      {canSearch && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/employees?q=${encodeURIComponent(q)}`);
          }}
          className="hidden items-center gap-2 rounded-xl border-2 border-ink bg-card px-3 py-1.5 shadow-brutal-sm sm:flex"
        >
          <Search size={15} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search people…"
            className="w-44 bg-transparent text-sm outline-none"
          />
        </form>
      )}

      <div className="relative" ref={bellRef}>
        <button
          onClick={() => setBellOpen((o) => !o)}
          className="relative rounded-xl border-2 border-ink bg-card p-2 shadow-brutal-sm press"
          aria-label="Notifications"
        >
          <Bell size={17} />
          {unread > 0 && (
            <span className="absolute -right-1.5 -top-1.5 rounded-full border-2 border-ink bg-tangerine px-1 text-[10px] font-extrabold text-white">
              {unread}
            </span>
          )}
        </button>
        {bellOpen && (
          <div className="pop-in absolute right-0 mt-2 w-80 rounded-2xl border-2 border-ink bg-card shadow-brutal-lg">
            <div className="flex items-center justify-between border-b-2 border-ink px-4 py-2.5">
              <span className="font-display font-bold">Notifications</span>
              {unread > 0 && (
                <button onClick={() => markAllRead()} className="text-xs font-bold underline">
                  Mark all read
                </button>
              )}
            </div>
            <ul className="max-h-80 overflow-y-auto">
              {notifications.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">All quiet here 🍵</li>}
              {notifications.map((n) => (
                <li key={n.id} className={cn("border-b border-soft-line px-4 py-3 text-sm last:border-0", !n.read && "bg-lime/20")}>
                  <Link href={n.link ?? "#"} onClick={() => setBellOpen(false)} className="block">
                    <p className="font-semibold">{n.title}</p>
                    {n.body && <p className="text-xs text-muted">{n.body}</p>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="relative" ref={menuRef}>
        <button onClick={() => setMenuOpen((o) => !o)} className="flex items-center gap-2 rounded-xl border-2 border-ink bg-card py-1 pl-1 pr-3 shadow-brutal-sm press">
          <Avatar name={user.name} color={user.color} size={28} />
          <span className="hidden text-sm font-bold sm:block">{user.name.split(" ")[0]}</span>
        </button>
        {menuOpen && (
          <div className="pop-in absolute right-0 mt-2 w-60 rounded-2xl border-2 border-ink bg-card p-2 shadow-brutal-lg">
            <div className="border-b-2 border-dashed border-soft-line px-3 pb-2 pt-1">
              <p className="font-bold">{user.name}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
              <p className="mt-1 inline-block rounded-full border-2 border-ink bg-sunny px-2 text-[10px] font-bold">{user.role}</p>
            </div>
            <Link href="/me/profile" onClick={() => setMenuOpen(false)} className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-paper-2">
              <UserRound size={15} /> My profile
            </Link>
            <button onClick={() => logout()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-cherry hover:bg-paper-2">
              <LogOut size={15} /> Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
