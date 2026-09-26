import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/server/context";
import { can, type Permission } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { gettingStarted } from "@/server/services/guide.service";
import { GettingStarted } from "@/components/getting-started";

export const metadata: Metadata = { title: "Help & guides" };

interface HowTo {
  title: string;
  steps: string[];
  link: { href: string; label: string };
  note?: string;
}

interface Section {
  id: string;
  title: string;
  emoji: string;
  /** Shown when the user has any of these permissions; omitted = everyone with an employee profile. */
  who?: Permission[];
  guides: HowTo[];
}

const SECTIONS: Section[] = [
  {
    id: "everyone",
    title: "Your day-to-day",
    emoji: "🙋",
    guides: [
      {
        title: "Clock in and out",
        steps: ["Open Me and press Clock in when you start work.", "Allow location when your browser asks. Clock-ins away from the office are accepted but flagged for HR.", "Press Clock out when you finish."],
        link: { href: "/me", label: "Go to Me" },
        note: "You're marked late after your company's grace period.",
      },
      {
        title: "Apply for leave",
        steps: ["Me → Apply leave, pick the type and dates (half days are allowed for most types).", "Attach your MC or supporting document where the type asks for one.", "Your manager is notified. You can cancel a request until it starts."],
        link: { href: "/me/leave", label: "My leave" },
        note: "Entitlements follow the Employment Act 1955: annual leave 8/12/16 days and sick leave 14/18/22 days by years of service, plus 60 days hospitalisation, 98 days maternity and 7 days paternity.",
      },
      {
        title: "Submit a claim",
        steps: ["Me → Submit claim, choose the claim type and the date you spent the money.", "Upload the receipt (PDF or photo) and describe what it was for.", "Once approved it's reimbursed in the next payroll."],
        link: { href: "/me/claims", label: "My claims" },
        note: "Claims must be made within 90 days, and monthly or yearly limits apply per claim type.",
      },
      {
        title: "Payslips and Form EA",
        steps: ["Payslips appear under Me → Payslips once payroll is paid.", "View or download the PDF: it looks exactly like the payslip on screen.", "Your Form EA for last year is under Me → Tax & reliefs by the end of February."],
        link: { href: "/me/payslips", label: "My payslips" },
      },
      {
        title: "Lower your monthly tax (TP1)",
        steps: ["Me → Tax & reliefs, enter this year's reliefs (life insurance, medical, education, childcare…).", "If you joined from another employer this year, add their pay and PCB (TP3).", "Your next payroll's PCB takes the reliefs into account."],
        link: { href: "/me/tax", label: "Tax & reliefs" },
      },
      {
        title: "Keep your details and account safe",
        steps: ["Me → Profile: update your phone, address, bank account and emergency contact.", "Change your password there too. Other devices are signed out when you do.", "Lost a phone? Use Log out of all devices."],
        link: { href: "/me/profile", label: "My profile" },
      },
      {
        title: "Ask HR or raise a concern",
        steps: ["Helpdesk: ask about pay, leave, letters or benefits and follow the replies.", "Grievances are confidential. You can raise most of them anonymously.", "Sexual harassment complaints need your name because the law requires an inquiry, but your identity stays confidential."],
        link: { href: "/helpdesk", label: "Helpdesk" },
      },
    ],
  },
  {
    id: "managers",
    title: "Approving requests",
    emoji: "✅",
    who: ["leave.approve", "claims.approve", "overtime.approve"],
    guides: [
      {
        title: "Work through your approvals inbox",
        steps: ["Approvals collects leave, claims and overtime from your reporting line.", "Approve, or reject with a reason (the employee sees it).", "Approve several routine requests at once with bulk approve."],
        link: { href: "/approvals", label: "Open approvals" },
        note: "You can never approve your own request, and overtime is capped at 104 hours a month by law.",
      },
    ],
  },
  {
    id: "hr",
    title: "People & HR",
    emoji: "🧑‍🤝‍🧑",
    who: ["employee.manage", "lifecycle.manage", "documents.manage"],
    guides: [
      {
        title: "Add employees",
        steps: ["Employees → Add, or import many at once from the CSV template.", "Enter the MyKad (NRIC) and the date of birth and gender fill in from it. Foreign staff need a passport.", "Basic pay can't be below the RM1,700 minimum wage for full-time staff."],
        link: { href: "/employees", label: "Employees" },
      },
      {
        title: "Invite people to Crewly",
        steps: ["Settings → Users, invite by email and pick a role.", "They get an email to set a password, and a Getting started checklist for their role."],
        link: { href: "/settings?tab=users", label: "Users" },
      },
      {
        title: "Letters: offer, confirmation, warning",
        steps: ["Letters & Policies → pick a template for an employee.", "Fill any [placeholders], then Issue. Issued letters can't be edited.", "The employee acknowledges it under Me → Documents."],
        link: { href: "/documents", label: "Letters & policies" },
      },
      {
        title: "When someone leaves",
        steps: ["Offboarding: record the separation, and Crewly works out the notice period, leave encashment and termination benefits.", "Approve it, post the final settlement to payroll, and collect company assets.", "Mark CP22A as submitted to LHDN, then complete."],
        link: { href: "/offboarding", label: "Offboarding" },
        note: "Crewly blocks terminating an employee on maternity leave (except proven misconduct) and retiring anyone before 60.",
      },
    ],
  },
  {
    id: "payroll",
    title: "Payroll & statutory",
    emoji: "💸",
    who: ["payroll.manage", "payroll.approve"],
    guides: [
      {
        title: "Run the monthly payroll",
        steps: [
          "Payroll → New run: pick the month and a pay date no later than 7 days after the month ends (Employment Act s.19).",
          "Calculate, then read any warnings on the run page.",
          "Someone other than the preparer approves it (maker-checker), then Mark paid. Employees get their payslips.",
        ],
        link: { href: "/payroll", label: "Payroll" },
        note: "If an adjustment, loan repayment or unpaid leave changes after calculation, the run goes back to draft until you recalculate.",
      },
      {
        title: "Pay KWSP, PERKESO, EIS, PCB and HRD Corp",
        steps: ["After payroll is paid, download the KWSP, PERKESO, CP39 and bank files from the run.", "Upload them to each portal and pay by the 15th of the following month."],
        link: { href: "/payroll", label: "Payroll runs" },
        note: "Check each file against the portal's current template before filing.",
      },
    ],
  },
  {
    id: "admin",
    title: "Workspace admin",
    emoji: "⚙️",
    who: ["settings.manage", "billing.manage"],
    guides: [
      {
        title: "Set up the workspace",
        steps: ["The six-step setup covers statutory numbers, departments, your profile, employees, invites and the first payroll.", "Settings holds the work week, pay day, late grace period and mileage rate."],
        link: { href: "/welcome", label: "Setup checklist" },
      },
      {
        title: "Plan & billing",
        steps: ["Settings → Plan & billing: choose a plan, pay by FPX or card, and view or download invoices."],
        link: { href: "/settings?tab=billing", label: "Billing" },
      },
    ],
  },
];

export default async function HelpPage() {
  const ctx = await requireCtx();
  const sections = SECTIONS.filter((s) => (s.who ? s.who.some((p) => can(ctx, p)) : !!ctx.employeeId));
  const guide = await gettingStarted(ctx);

  return (
    <>
      <PageHeader title="Help & guides" emoji="🧭" subtitle="How to get things done in Crewly, for what your role can do." />
      <GettingStarted guide={guide} />
      <nav aria-label="Guide sections" className="mb-6 flex flex-wrap gap-2">
        {sections.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-full border-2 border-ink bg-card px-3 py-1 text-sm font-bold hover:bg-paper-2">
            {s.emoji} {s.title}
          </a>
        ))}
      </nav>
      <div className="space-y-10">
        {sections.map((s) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-24">
            <h2 id={`${s.id}-title`} className="mb-4 font-display text-xl font-extrabold">
              {s.emoji} {s.title}
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {s.guides.map((g) => (
                <article key={g.title} className="flex flex-col rounded-2xl border-2 border-ink bg-card p-5 shadow-brutal-sm">
                  <h3 className="font-bold">{g.title}</h3>
                  <ol className="mt-2 flex-1 list-decimal space-y-1 pl-5 text-sm">
                    {g.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  {g.note && <p className="mt-3 rounded-xl bg-paper-2 px-3 py-2 text-xs text-ink-2">{g.note}</p>}
                  <Link href={g.link.href} className="mt-3 text-sm font-bold underline">
                    {g.link.label} →
                  </Link>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
      <p className="mt-10 text-sm text-muted">
        Still stuck? <Link href="/helpdesk" className="font-bold underline">Ask HR in the helpdesk</Link>.
      </p>
    </>
  );
}
