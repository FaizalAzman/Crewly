import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/server/context";
import { activeHeadcount, PLANS, tenantAccess } from "@/server/services/subscription.service";
import { monthlyRevenue } from "@/server/services/platform.service";
import { FormModal } from "@/components/forms";
import { Badge, Card, CardBody, CardHeader, Field, Input, KV, LinkButton, Money, PageHeader, Select, StatusBadge, Table, TD, TH, THead, TR } from "@/components/ui";
import { fmtDate, fmtTime, rm } from "@/lib/utils";
import { extendTrialAction, reactivateAction, setPlanAction, suspendAction } from "../../actions";

export default async function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser();
  if (!u?.platformAdmin) notFound();
  const { id } = await params;
  const t = await prisma.tenant.findUnique({ where: { id }, include: { companies: true, users: { orderBy: { createdAt: "asc" } }, invoices: { orderBy: { issuedAt: "desc" } } } });
  if (!t) notFound();
  const [headcount, logs, emails] = await Promise.all([
    activeHeadcount(t.id),
    prisma.auditLog.findMany({ where: { tenantId: t.id, userName: { startsWith: "Crewly Support" } }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.outboundEmail.findMany({ where: { tenantId: t.id }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const access = tenantAccess(t);
  return (
    <>
      <PageHeader
        kicker={t.slug}
        title={t.name}
        emoji="🏢"
        subtitle={access.message}
        actions={
          <>
            <LinkButton href="/platform" variant="secondary">← Workspaces</LinkButton>
            {t.subscriptionStatus === "TRIALING" && (
              <FormModal trigger="Extend trial" triggerVariant="lime" title="Extend trial" action={extendTrialAction}>
                <input type="hidden" name="tenantId" value={t.id} />
                <Field label="Days"><Input type="number" name="days" defaultValue="14" min={1} max={90} /></Field>
              </FormModal>
            )}
            <FormModal trigger="Set plan" triggerVariant="secondary" title="Set plan (support override)" subtitle="For offline invoices or comped accounts" action={setPlanAction}>
              <input type="hidden" name="tenantId" value={t.id} />
              <Field label="Plan"><Select name="plan" defaultValue={t.plan} options={Object.entries(PLANS).map(([k, p]) => ({ value: k, label: p.name }))} /></Field>
              <Field label="Mark active until (optional)"><Input type="date" name="activeUntil" /></Field>
            </FormModal>
            {t.subscriptionStatus === "SUSPENDED" || t.closedAt ? (
              <FormModal trigger="Reactivate" triggerVariant="lime" title="Reactivate workspace" action={reactivateAction}>
                <input type="hidden" name="tenantId" value={t.id} />
                <p className="text-sm">Restores access. Status goes back to active, trial or past due depending on dates.</p>
              </FormModal>
            ) : (
              <FormModal trigger="Suspend" triggerVariant="danger" title="Suspend workspace" subtitle="Everyone in this workspace is signed out immediately." action={suspendAction}>
                <input type="hidden" name="tenantId" value={t.id} />
                <Field label="Reason (shown to the customer)"><Input name="reason" required placeholder="Payment dispute / abuse report" /></Field>
              </FormModal>
            )}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Subscription" emoji="💳" />
          <CardBody>
            <dl className="grid grid-cols-2 gap-4">
              <KV label="Plan" value={`${t.plan} · ${t.billingCycle.toLowerCase()}`} />
              <KV label="Status" value={<StatusBadge status={t.subscriptionStatus === "TRIALING" ? "PENDING" : t.subscriptionStatus === "ACTIVE" ? "ACTIVE" : "REJECTED"} />} />
              <KV label="Trial ends" value={fmtDate(t.trialEndsAt, "long")} />
              <KV label="Period ends" value={fmtDate(t.currentPeriodEnd, "long")} />
              <KV label="Active employees" value={headcount} />
              <KV label="MRR" value={rm(monthlyRevenue(t, headcount))} />
              <KV label="Created" value={fmtDate(t.createdAt, "long")} />
              <KV label="Setup finished" value={t.onboardedAt ? fmtDate(t.onboardedAt) : "Not yet"} />
            </dl>
            {t.suspendedReason && <p className="mt-3 text-sm"><Badge tone="ink">Suspended</Badge> {t.suspendedReason}</p>}
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Users" emoji="👥" />
          <Table>
            <THead><tr><TH>Name</TH><TH>Email</TH><TH>Role</TH><TH>Last login</TH></tr></THead>
            <tbody>
              {t.users.map((x) => (
                <TR key={x.id}>
                  <TD className="font-semibold">{x.name}</TD>
                  <TD className="text-xs">{x.email}</TD>
                  <TD><Badge tone="gray">{x.role}</Badge></TD>
                  <TD className="text-xs">{x.lastLoginAt ? `${fmtDate(x.lastLoginAt)} ${fmtTime(x.lastLoginAt)}` : "Never"}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Invoices" emoji="🧾" />
          <Table>
            <THead><tr><TH>No.</TH><TH>Plan</TH><TH>Seats</TH><TH className="text-right">Total</TH><TH>Status</TH><TH>Ref</TH></tr></THead>
            <tbody>
              {t.invoices.map((i) => (
                <TR key={i.id}>
                  <TD className="font-mono text-xs">{i.number}</TD>
                  <TD className="text-xs">{i.plan} · {i.cycle.toLowerCase()}</TD>
                  <TD>{i.seats}</TD>
                  <TD className="text-right"><Money value={i.amount + i.sst} /></TD>
                  <TD><StatusBadge status={i.status} /></TD>
                  <TD className="font-mono text-[11px]">{i.paymentRef ?? "-"}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Support log & emails" emoji="🗒️" />
          <CardBody className="space-y-2 text-xs">
            {logs.map((l) => <p key={l.id}><b>{fmtDate(l.createdAt)}</b> {l.summary}</p>)}
            {emails.map((e) => <p key={e.id}>✉️ {fmtDate(e.createdAt)} · {e.subject} <span className="text-muted">({e.status.toLowerCase()})</span></p>)}
            {!logs.length && !emails.length && <p className="text-muted">Nothing yet.</p>}
          </CardBody>
        </Card>
      </div>
      <p className="mt-6 text-xs text-muted">Entities: {t.companies.map((c) => c.name).join(", ")}</p>
    </>
  );
}
