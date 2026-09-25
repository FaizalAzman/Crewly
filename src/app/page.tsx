import Link from "next/link";
import { Logo } from "@/components/logo";
import { btnClass } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { MobileNotice } from "@/components/mobile-notice";

const MODULES = [
  ["🧑‍🤝‍🧑", "Employee records"], ["🏢", "Multi-entity org"], ["🧲", "Recruitment (ATS)"], ["🚀", "Onboarding"], ["👋", "Offboarding"],
  ["🌴", "Leave (EA 1955)"], ["📅", "State public holidays"], ["📍", "GPS attendance"], ["🗓️", "Shifts & rostering"], ["⏱️", "Overtime"],
  ["💸", "Payroll"], ["🧾", "Pay items"], ["🏛️", "EPF · SOCSO · EIS"], ["🧮", "PCB / MTD"], ["📄", "Form EA & CP8D"],
  ["💳", "Claims"], ["🪙", "Loans & advances"], ["📈", "Compensation"], ["🩺", "Benefits & insurance"], ["🎯", "Performance & OKRs"],
  ["🎓", "Training & HRD Corp"], ["⚖️", "Disciplinary cases"], ["🛡️", "Grievances"], ["🌏", "Foreign workforce"],
  ["✉️", "Letters & policies"], ["💻", "Asset tracking"], ["🎉", "Kudos & surveys"], ["🛟", "HR helpdesk"], ["✅", "Approvals inbox"],
  ["🙋", "Employee self-service"], ["📊", "Analytics"], ["🔐", "Audit log & PDPA"],
];

const PLANS = [
  { name: "Starter", price: 6, tone: "bg-card", blurb: "Payroll and leave for small teams", features: ["Up to 25 employees", "Payroll & statutory filings", "Leave & holidays", "Employee self-service"] },
  { name: "Growth", price: 12, tone: "bg-lime", blurb: "Everything a growing company needs", features: ["Unlimited employees", "All 32 modules", "Approval workflows", "Training & HRD Corp", "Priority support"], hot: true },
  { name: "Enterprise", price: 18, tone: "bg-sky", blurb: "For groups and corporates", features: ["Multiple legal entities", "SSO & audit exports", "Custom workflows", "Dedicated success manager", "Private cloud option"] },
];

const STEPS = [
  { n: "01", t: "Import your people", s: "Upload a CSV or add employees one by one. NRIC details like date of birth and gender fill in automatically." },
  { n: "02", t: "Run payroll", s: "One click calculates EPF, SOCSO, EIS, PCB, zakat and HRD Corp for every employee, down to the sen." },
  { n: "03", t: "File & pay", s: "Download KWSP, PERKESO and LHDN CP39 files plus the bank payment file, then send payslips." },
];

export default function Landing() {
  return (
    <div className="overflow-x-hidden">
      <header className="sticky top-0 z-30 border-b-2 border-ink bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo />
          <nav className="hidden items-center gap-6 text-sm font-semibold md:flex">
            <a href="#modules" className="hover:underline">Product</a>
            <a href="#compliance" className="hover:underline">Compliance</a>
            <a href="#pricing" className="hover:underline">Pricing</a>
          </nav>
          <div className="flex gap-2">
            <Link href="/login" className={btnClass("secondary", "sm")}>Log in</Link>
            <Link href="/signup" className={btnClass("primary", "sm")}>Start free trial</Link>
          </div>
        </div>
      </header>

      <MobileNotice variant="public" />

      {/* Hero */}
      <section className="bg-dots relative">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:py-24 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <div className="inline-flex -rotate-1 items-center gap-2 rounded-full border-2 border-ink bg-sunny px-3 py-1 text-xs font-bold shadow-brutal-sm">
              🇲🇾 Built for Malaysia · Updated for 2026 statutory rules
            </div>
            <h1 className="font-display mt-6 text-5xl font-extrabold leading-[1.02] md:text-7xl">
              People ops, <span className="relative inline-block -rotate-2 rounded-xl border-2 border-ink bg-lime px-3 shadow-brutal">minus</span> the paperwork.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-ink-2">
              {BRAND.name} brings payroll, statutory contributions, leave, claims, performance and more than 25 other modules into one workspace, so your HR team can focus on people instead of spreadsheets.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className={btnClass("primary", "lg")}>Start 14-day free trial →</Link>
              <Link href="/login" className={btnClass("lime", "lg")}>Explore the demo</Link>
            </div>
            <p className="mt-4 text-xs font-semibold text-muted">No credit card required · Set up in under 10 minutes · Cancel anytime</p>
          </div>
          <div className="relative">
            <div className="rotate-2 rounded-3xl border-2 border-ink bg-card p-5 shadow-brutal-lg">
              <div className="flex items-center justify-between">
                <span className="font-display text-lg font-extrabold">Payroll · September 2026</span>
                <span className="rounded-full border-2 border-ink bg-mint px-2 text-xs font-bold">Approved ✓</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  ["Net pay", "RM 412,380.55", "bg-lime"],
                  ["EPF", "RM 98,114.00", "bg-sky"],
                  ["SOCSO + EIS", "RM 9,842.30", "bg-bubblegum"],
                  ["PCB", "RM 31,207.65", "bg-sunny"],
                ].map(([l, v, c]) => (
                  <div key={l} className={`rounded-xl border-2 border-ink p-3 ${c}`}>
                    <p className="text-[10px] font-bold uppercase">{l}</p>
                    <p className="font-display tabular text-lg font-extrabold">{v}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-2">
                {["12 leave requests approved this week", "CP39 file ready for e-PCB", "EPF contribution file ready for i-Akaun"].map((t) => (
                  <div key={t} className="flex items-center gap-2 rounded-lg border-2 border-dashed border-soft-line px-3 py-2 text-xs font-semibold">
                    ⚡ {t}
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute -bottom-6 -left-6 -rotate-6 rounded-2xl border-2 border-ink bg-tangerine px-4 py-3 font-display text-white shadow-brutal">
              <p className="text-xs font-bold uppercase">Payroll time saved</p>
              <p className="text-2xl font-extrabold">~26 hrs / month</p>
            </div>
          </div>
        </div>
      </section>

      {/* Marquee */}
      <div className="overflow-hidden border-y-2 border-ink bg-ink py-3 text-paper">
        <div className="marquee flex w-max gap-10 whitespace-nowrap font-display text-lg font-bold">
          {[...Array(2)].flatMap((_, k) =>
            ["KWSP ✦", "PERKESO ✦", "EIS ✦", "LHDN PCB ✦", "HRD Corp ✦", "Employment Act 1955 ✦", "PDPA 2010 ✦", "Minimum Wage RM1,700 ✦", "Form EA ✦", "CP22 / CP22A ✦"].map((t) => (
              <span key={`${k}-${t}`}>{t}</span>
            )),
          )}
        </div>
      </div>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 pt-20">
        <div className="grid gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.n} className="rounded-2xl border-2 border-ink bg-card p-6 shadow-brutal" style={{ transform: `rotate(${[-1, 0.5, -0.5][i]}deg)` }}>
              <span className="font-display text-sm font-extrabold text-grape">{s.n}</span>
              <p className="font-display mt-1 text-2xl font-extrabold">{s.t}</p>
              <p className="mt-2 text-sm text-ink-2">{s.s}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Modules */}
      <section id="modules" className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="font-display text-4xl font-extrabold md:text-5xl">32 modules. One login.</h2>
        <p className="mt-3 max-w-2xl text-ink-2">Covers the whole employee lifecycle, from the job posting to the certificate of service, with every payroll in between.</p>
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {MODULES.map(([e, t], i) => (
            <div
              key={t}
              className="press flex items-center gap-3 rounded-2xl border-2 border-ink bg-card px-4 py-3 shadow-brutal-sm"
              style={{ background: i % 7 === 0 ? "var(--lime)" : i % 11 === 0 ? "var(--bubblegum)" : undefined }}
            >
              <span className="text-2xl">{e}</span>
              <span className="text-sm font-bold">{t}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Compliance */}
      <section id="compliance" className="border-y-2 border-ink bg-grape py-20 text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-4xl font-extrabold md:text-5xl">Compliance built in.</h2>
            <p className="mt-4 text-white/85">
              Every statutory rule is encoded and covered by automated tests, from EPF bands to PCB for bonuses. When the rules change, we update them for you.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["EPF Third Schedule", "11% / 13% / 12% bands, age-60 rates, and the 2% non-citizen rate from October 2025"],
              ["SOCSO & EIS", "RM6,000 wage ceiling, Categories 1 & 2, and the foreign worker EI scheme"],
              ["PCB / MTD 2026", "LHDN computerised method, TP1 / TP3, bonus PCB and zakat offset"],
              ["Employment Act 1955", "2022 amendments: 98-day maternity leave, 7-day paternity leave, 45-hour work week"],
            ].map(([t, s]) => (
              <div key={t} className="rounded-2xl border-2 border-ink bg-card p-5 text-ink shadow-brutal">
                <p className="font-display text-lg font-extrabold">{t}</p>
                <p className="mt-1 text-sm text-ink-2">{s}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-dots mx-auto max-w-6xl px-4 py-20">
        <h2 className="font-display text-center text-4xl font-extrabold md:text-5xl">Simple, per-employee pricing.</h2>
        <p className="mt-3 text-center text-ink-2">Prices exclude 8% SST. Save two months when you pay yearly.</p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {PLANS.map((p) => (
            <div key={p.name} className={`relative rounded-3xl border-2 border-ink p-7 shadow-brutal-lg ${p.tone}`}>
              {p.hot && (
                <span className="absolute -top-4 right-6 rotate-3 rounded-full border-2 border-ink bg-tangerine px-3 py-1 text-xs font-bold text-white">
                  Most popular
                </span>
              )}
              <p className="font-display text-2xl font-extrabold">{p.name}</p>
              <p className="text-sm text-ink-2">{p.blurb}</p>
              <p className="font-display mt-5 text-5xl font-extrabold">
                RM{p.price}
                <span className="text-base font-bold text-ink-2">/employee/mo</span>
              </p>
              <ul className="mt-6 space-y-2 text-sm font-semibold">
                {p.features.map((f) => (
                  <li key={f}>✓ {f}</li>
                ))}
              </ul>
              <Link href="/signup" className={`${btnClass(p.hot ? "primary" : "secondary")} mt-7 w-full`}>
                Start with {p.name}
              </Link>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t-2 border-ink bg-ink py-10 text-paper">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 md:flex-row">
          <Logo light />
          <p className="text-sm text-paper/70">
            © {new Date().getFullYear()} {BRAND.company} · Kuala Lumpur · Not affiliated with KWSP, PERKESO or LHDN.
          </p>
        </div>
      </footer>
    </div>
  );
}
