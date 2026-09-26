import Link from "next/link";
import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { ActionButton } from "@/components/forms";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Table, TD, TH, THead, TR } from "@/components/ui";
import { fmtDate } from "@/lib/utils";
import { humanize } from "@/lib/constants";
import { ackLetterAction } from "../../documents/actions";
import { ackPolicyAction } from "../actions";

export const metadata: Metadata = { title: "My documents" };

export default async function MyDocumentsPage() {
  const ctx = await requireCtx();
  const id = ctx.employeeId!;
  const [letters, docs, policies, concerns] = await Promise.all([
    prisma.generatedLetter.findMany({ where: { employeeId: id, status: { in: ["ISSUED", "ACKNOWLEDGED"] } }, orderBy: { issuedAt: "desc" } }),
    prisma.employeeDocument.findMany({ where: { employeeId: id }, orderBy: { createdAt: "desc" } }),
    prisma.policy.findMany({ where: { tenantId: ctx.tenantId }, include: { acknowledgements: { where: { employeeId: id } } }, orderBy: { publishedAt: "desc" } }),
    prisma.grievance.findMany({ where: { employeeId: id }, orderBy: { createdAt: "desc" } }),
  ]);
  const pendingLetters = letters.filter((l) => l.status === "ISSUED").length;
  const pendingPolicies = policies.filter((p) => p.requiresAck && p.acknowledgements.length === 0).length;
  return (
    <>
      <PageHeader title="My documents" emoji="📁" subtitle={pendingLetters + pendingPolicies ? `${pendingLetters + pendingPolicies} item(s) need your acknowledgement.` : "Letters from HR, your files and company policies."} />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Letters from HR" emoji="✉️" />
          {letters.length === 0 ? (
            <EmptyState emoji="✉️" title="No letters yet" />
          ) : (
            <Table>
              <THead><tr><TH>Letter</TH><TH>Issued</TH><TH>Status</TH><TH /></tr></THead>
              <tbody>
                {letters.map((l) => (
                  <TR key={l.id}>
                    <TD className="font-semibold">{l.title.split(" — ")[0]}</TD>
                    <TD className="text-xs">{fmtDate(l.issuedAt)}</TD>
                    <TD>{l.status === "ACKNOWLEDGED" ? <Badge tone="green">Acknowledged {fmtDate(l.acknowledgedAt)}</Badge> : <Badge tone="orange">Please acknowledge</Badge>}</TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        <Link href={`/documents/letters/${l.id}`} className="rounded-lg border-2 border-ink bg-card px-2 py-1 text-xs font-bold">Read</Link>
                        {l.status === "ISSUED" && <ActionButton action={ackLetterAction} fields={{ id: l.id }} variant="lime">Acknowledge</ActionButton>}
                      </div>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="My files" emoji="🗂️" subtitle="Copies HR keeps on your record (IC, certificates, contracts)" />
          {docs.length === 0 ? (
            <EmptyState emoji="🗂️" title="No files on record" />
          ) : (
            <Table>
              <THead><tr><TH>Document</TH><TH>Type</TH><TH>Expiry</TH></tr></THead>
              <tbody>
                {docs.map((d) => (
                  <TR key={d.id}>
                    <TD className="font-semibold">{d.url ? <a href={d.url} target="_blank" rel="noreferrer" className="underline">{d.name}</a> : d.name}</TD>
                    <TD className="text-xs">{humanize(d.type)}</TD>
                    <TD className="text-xs">{fmtDate(d.expiryDate)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        {concerns.length > 0 && (
          <Card>
            <CardHeader title="Concerns you've raised" emoji="🛡️" subtitle="Handled confidentially. Anonymous submissions aren't listed here." />
            <Table>
              <THead><tr><TH>Ref</TH><TH>Subject</TH><TH>Status</TH><TH>Outcome</TH></tr></THead>
              <tbody>
                {concerns.map((g) => (
                  <TR key={g.id}>
                    <TD className="font-mono text-xs">{g.refNo}</TD>
                    <TD className="font-semibold">{g.subject}<span className="block text-xs text-muted">{humanize(g.category)} · {fmtDate(g.createdAt)}</span></TD>
                    <TD><Badge tone={["RESOLVED", "CLOSED"].includes(g.status) ? "green" : "yellow"}>{humanize(g.status)}</Badge></TD>
                    <TD className="max-w-xs text-xs">{g.resolution ?? "-"}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {policies.map((p) => {
            const acked = p.acknowledgements[0];
            return (
              <Card key={p.id}>
                <CardHeader title={p.title} emoji="📜" subtitle={`v${p.version} · ${fmtDate(p.publishedAt)}`} action={p.requiresAck ? (acked ? <Badge tone="green">Acknowledged</Badge> : <Badge tone="orange">Action needed</Badge>) : null} />
                <CardBody className="space-y-3">
                  <p className="whitespace-pre-wrap text-sm text-ink-2">{p.content}</p>
                  {p.requiresAck && !acked && <ActionButton action={ackPolicyAction} fields={{ policyId: p.id }} variant="primary">I have read and acknowledge this policy</ActionButton>}
                  {acked && <p className="text-xs text-muted">You acknowledged this on {fmtDate(acked.ackAt, "long")}.</p>}
                </CardBody>
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}
