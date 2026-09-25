import Link from "next/link";
import { cn, initials } from "@/lib/utils";
import { humanize } from "@/lib/constants";

// ───────────── Buttons ─────────────

type BtnVariant = "primary" | "secondary" | "lime" | "grape" | "ghost" | "danger";
const BTN: Record<BtnVariant, string> = {
  primary: "bg-ink text-paper border-ink",
  secondary: "bg-card text-ink border-ink",
  lime: "bg-lime text-ink border-ink",
  grape: "bg-grape text-white border-ink",
  ghost: "bg-transparent text-ink border-transparent shadow-none hover:bg-paper-2",
  danger: "bg-cherry text-white border-ink",
};
const BTN_SIZE = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-base" };

export function btnClass(variant: BtnVariant = "primary", size: keyof typeof BTN_SIZE = "md") {
  return cn(
    "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border-2 font-bold disabled:cursor-not-allowed disabled:opacity-50",
    variant !== "ghost" && "press shadow-brutal-sm",
    BTN[variant],
    BTN_SIZE[size],
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: keyof typeof BTN_SIZE }) {
  return <button className={cn(btnClass(variant, size), className)} {...props} />;
}

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: { href: string; variant?: BtnVariant; size?: keyof typeof BTN_SIZE; className?: string; children: React.ReactNode } & Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
>) {
  return (
    <Link href={href} className={cn(btnClass(variant, size), className)} {...rest}>
      {children}
    </Link>
  );
}

// ───────────── Surfaces ─────────────

export function Card({ className, children, tone }: { className?: string; children: React.ReactNode; tone?: string }) {
  return (
    <div className={cn("rounded-2xl border-2 border-ink bg-card shadow-brutal", tone, className)}>{children}</div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  emoji,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  emoji?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b-2 border-ink px-5 py-3.5">
      <div className="min-w-0">
        <h3 className="font-display flex items-center gap-2 text-lg font-bold">
          {emoji && <span>{emoji}</span>}
          {title}
        </h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("p-5", className)}>{children}</div>;
}

export function PageHeader({
  title,
  emoji,
  subtitle,
  actions,
  kicker,
}: {
  title: string;
  emoji?: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  kicker?: string;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        {kicker && (
          <div className="mb-2 inline-block -rotate-1 rounded-md border-2 border-ink bg-sunny px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider">
            {kicker}
          </div>
        )}
        <h1 className="font-display flex items-center gap-3 text-3xl font-extrabold md:text-4xl">
          {emoji && <span className="wiggle inline-block">{emoji}</span>}
          {title}
        </h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const STAT_TONES = {
  lime: "bg-lime",
  grape: "bg-grape text-white",
  sky: "bg-sky",
  bubblegum: "bg-bubblegum",
  sunny: "bg-sunny",
  tangerine: "bg-tangerine text-white",
  mint: "bg-mint",
  white: "bg-card",
};

export function StatCard({
  label,
  value,
  hint,
  tone = "white",
  emoji,
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: keyof typeof STAT_TONES;
  emoji?: string;
  href?: string;
}) {
  const inner = (
    <div className={cn("relative h-full overflow-hidden rounded-2xl border-2 border-ink p-4 shadow-brutal", STAT_TONES[tone], href && "press")}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-bold uppercase tracking-wider opacity-80">{label}</p>
        {emoji && <span className="text-2xl leading-none">{emoji}</span>}
      </div>
      <p className="font-display tabular mt-2 text-3xl font-extrabold">{value}</p>
      {hint && <p className="mt-1 text-xs font-medium opacity-80">{hint}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
}

// ───────────── Badges ─────────────

const BADGE_TONES: Record<string, string> = {
  green: "bg-mint",
  lime: "bg-lime",
  yellow: "bg-sunny",
  orange: "bg-tangerine text-white",
  red: "bg-cherry text-white",
  purple: "bg-grape text-white",
  blue: "bg-sky",
  pink: "bg-bubblegum",
  gray: "bg-paper-2",
  ink: "bg-ink text-paper",
};

export function Badge({ tone = "gray", children, className }: { tone?: keyof typeof BADGE_TONES | string; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border-2 border-ink px-2 py-0.5 text-[11px] font-bold",
        BADGE_TONES[tone] ?? BADGE_TONES.gray,
        className,
      )}
    >
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "green", APPROVED: "green", PAID: "green", COMPLETED: "green", HIRED: "green", PRESENT: "green", RESOLVED: "green",
  DONE: "green", ON_TRACK: "green", FIT: "green", SETTLED: "green", LOCKED: "ink", CLOSED: "gray", APPLIED: "blue",
  PENDING: "yellow", PROBATION: "yellow", DRAFT: "gray", CALCULATED: "blue", SCREENING: "blue", INTERVIEW: "purple",
  OFFER: "pink", OPEN: "blue", IN_PROGRESS: "purple", WAITING: "yellow", INVESTIGATING: "purple", AT_RISK: "yellow",
  NOTICE: "orange", LATE: "orange", REJECTED: "red", CANCELLED: "gray", TERMINATED: "red", RESIGNED: "gray",
  RETIRED: "gray", ABSENT: "red", OFF_TRACK: "red", EXPIRED: "red", UNFIT: "red", WITHDRAWN: "gray", ON_LEAVE: "blue",
  HOLIDAY: "pink", REST: "gray", ASSIGNED: "purple", AVAILABLE: "green", REPAIR: "yellow", LOST: "red", ON_HOLD: "yellow",
  SCHEDULED: "blue", ONGOING: "purple", ENROLLED: "blue", ATTENDED: "lime", NO_SHOW: "red", RENEWAL: "orange",
  SELF_REVIEW: "yellow", MANAGER_REVIEW: "purple", CALIBRATION: "pink", REPORTED: "yellow", SHOW_CAUSE: "orange",
  DOMESTIC_INQUIRY: "purple", DECIDED: "blue", INVESTIGATION: "purple", REFERRED: "pink", DUE: "yellow", OVERDUE: "red",
  URGENT: "red", HIGH: "orange", MEDIUM: "yellow", LOW: "gray",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "gray"}>{humanize(status)}</Badge>;
}

// ───────────── Avatar ─────────────

export function Avatar({ name, color = "#FFD23F", size = 36 }: { name: string; color?: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full border-2 border-ink font-bold"
      style={{ background: color, width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function PersonCell({ name, sub, color, href }: { name: string; sub?: React.ReactNode; color?: string; href?: string }) {
  const content = (
    <span className="flex items-center gap-2.5">
      <Avatar name={name} color={color} size={32} />
      <span className="min-w-0">
        <span className="block truncate font-semibold">{name}</span>
        {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
      </span>
    </span>
  );
  return href ? (
    <Link href={href} className="hover:underline">
      {content}
    </Link>
  ) : (
    content
  );
}

// ───────────── Tables ─────────────

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[640px] border-collapse text-sm">{children}</table>
    </div>
  );
}
export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-paper-2 text-left text-[11px] font-bold uppercase tracking-wider text-ink-2">{children}</thead>;
}
export function TH({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cn("border-b-2 border-ink px-4 py-2.5 font-bold", className)}>{children}</th>;
}
export function TR({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={cn("border-b border-soft-line last:border-0 hover:bg-paper/60", className)}>{children}</tr>;
}
export function TD({ children, className, colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn("px-4 py-3 align-middle", className)}>
      {children}
    </td>
  );
}

// ───────────── Empty state ─────────────

export function EmptyState({ emoji = "🍃", title, body, action }: { emoji?: string; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex h-16 w-16 rotate-3 items-center justify-center rounded-2xl border-2 border-ink bg-sunny text-3xl shadow-brutal-sm">
        {emoji}
      </div>
      <p className="font-display text-lg font-bold">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ───────────── Form fields ─────────────

export const inputClass =
  "h-10 w-full rounded-xl border-2 border-ink bg-card px-3 text-sm outline-none transition focus:bg-paper focus:shadow-brutal-sm disabled:opacity-60";

export function Field({
  label,
  hint,
  children,
  className,
  required,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  required?: boolean;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-2">
        {label}
        {required && <span className="text-tangerine"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cn(inputClass, "h-auto py-2", props.className)} />;
}

export function Select({
  options,
  placeholder,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  options: (string | { value: string; label: string })[];
  placeholder?: string;
}) {
  return (
    <select {...props} className={cn(inputClass, "cursor-pointer pr-8", props.className)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => {
        const opt = typeof o === "string" ? { value: o, label: humanize(o) } : o;
        return (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        );
      })}
    </select>
  );
}

export function Checkbox({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
      <input type="checkbox" {...props} className="h-4 w-4 rounded border-2 border-ink" />
      {label}
    </label>
  );
}

// ───────────── Tabs (URL based) ─────────────

export function Tabs({ tabs, active }: { tabs: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto rounded-2xl border-2 border-ink bg-card p-1 shadow-brutal-sm">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cn(
            "flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-1.5 text-sm font-bold transition",
            active === t.key ? "bg-ink text-paper" : "hover:bg-paper-2",
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className={cn("rounded-full px-1.5 text-[10px]", active === t.key ? "bg-lime text-ink" : "bg-paper-2")}>{t.count}</span>
          )}
        </Link>
      ))}
    </div>
  );
}

// ───────────── Misc ─────────────

export function Progress({ value, tone = "bg-lime", className }: { value: number; tone?: string; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-3 w-full overflow-hidden rounded-full border-2 border-ink bg-paper-2", className)}>
      <div className={cn("h-full border-r-2 border-ink", tone)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function KV({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-muted">{label}</dt>
      <dd className={cn("mt-0.5 text-sm font-semibold", mono && "font-mono")}>{value ?? "-"}</dd>
    </div>
  );
}

export function Callout({ tone = "sunny", emoji = "💡", children }: { tone?: "sunny" | "sky" | "lime" | "bubblegum" | "cherry"; emoji?: string; children: React.ReactNode }) {
  const bg = { sunny: "bg-sunny", sky: "bg-sky", lime: "bg-lime", bubblegum: "bg-bubblegum", cherry: "bg-cherry text-white" }[tone];
  return (
    <div className={cn("flex items-start gap-3 rounded-2xl border-2 border-ink px-4 py-3 text-sm shadow-brutal-sm", bg)}>
      <span className="text-lg leading-5">{emoji}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Money({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("tabular font-mono", className)}>
      {(value ?? 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}
