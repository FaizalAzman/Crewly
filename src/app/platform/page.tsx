import Link from "next/link";
import { getSessionUser } from "@/server/context";
import { listWorkspaces, platformMetrics } from "@/server/services/platform.service";
import { Badge, Card, Input, PageHeader, StatCard, Table, TD, TH, THead, TR, btnClass } from "@/components/ui";
import { fmtDate, rm } from "@/lib/utils";

const STATE_TONE: Record<string, string> = { TRIAL: "yellow", ACTIVE: "green", CANCELLED_GRACE: "orange", TRIAL_ENDED: "red", PAST_DUE: "red", CANCELLED: "gray", SUSPENDED: "ink", CLOSED: "gray" };

export default async function PlatformHome({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const u = (await getSessionUser())!;
  const actor = { userId: u.id, name: u.name, platformAdmin: u.platformAdmin };
  const q = (await searchParams).q;
  const [m, rows] = await Promise.all([platformMetrics(actor), listWorkspaces(actor, q)]);
  return (
    <>
      <PageHeader title="Workspaces" emoji="🛰️" subtitle="Every customer on Crewly: trials, subscriptions, usage and support actions." />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="MRR" value={rm(m.mrr, { decimals: 0 })} tone="lime" emoji="💰" />
        <StatCard label="Paying" value={m.paying} tone="sky" emoji="✅" />
        <StatCard label="In trial" value={m.trialing} tone="sunny" emoji="🎁" />
        <StatCard label="At risk" value={m.atRisk} hint="Trial ended / unpaid / cancelled" tone="bubblegum" emoji="🚨" />
        <StatCard label="Employees managed" value={m.employees} tone="white" emoji="🧑‍🤝‍🧑" />
        <StatCard label="Sign-ups (30d)" value={m.signups30d} tone="grape" emoji="📈" />
      </div>
      <form className="mb-4 flex gap-2">
        <Input name="q" defaultValue={q} placeholder="Search workspace name or slug…" className="max-w-sm" />
        <button className={btnClass("primary")}>Search</button>
      </form>
      <Card>
        <Table>
          <THead>
            <tr><TH>Workspace</TH><TH>Owner</TH><TH>Plan</TH><TH>Status</TH><TH className="text-right">Employees</TH><TH className="text-right">MRR</TH><TH>Last active</TH><TH>Created</TH></tr>
          </THead>
          <tbody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD>
                  <Link href={`/platform/workspaces/${r.id}`} className="font-bold underline">{r.name}</Link>
                  <span className="block font-mono text-[11px] text-muted">{r.slug}</span>
                </TD>
                <TD className="text-xs">{r.owner?.name}<span className="block text-muted">{r.owner?.email}</span></TD>
                <TD className="text-xs">{r.plan} · {r.billingCycle.toLowerCase()}</TD>
                <TD>
                  <Badge tone={STATE_TONE[r.access.state] ?? "gray"}>{r.access.state.replace("_", " ").toLowerCase()}</Badge>
                  {r.access.daysLeft !== null && r.access.state === "TRIAL" && <span className="ml-1 text-xs">{r.access.daysLeft}d</span>}
                </TD>
                <TD className="text-right">{r.headcount}</TD>
                <TD className="text-right font-mono text-xs">{rm(r.mrr)}</TD>
                <TD className="text-xs">{fmtDate(r.lastLoginAt)}</TD>
                <TD className="text-xs">{fmtDate(r.createdAt)}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
