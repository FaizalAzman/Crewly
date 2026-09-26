import { prisma } from "@/lib/db";
import { Badge, Card, PageHeader, Table, TD, TH, THead, TR } from "@/components/ui";
import { fmtDate, fmtTime } from "@/lib/utils";

export const metadata = { title: "Email outbox" };

export default async function EmailsPage() {
  const emails = await prisma.outboundEmail.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  return (
    <>
      <PageHeader title="Email outbox" emoji="✉️" subtitle="Every message Crewly sends. Without MAIL_PROVIDER set, messages are logged here instead of delivered." />
      <Card>
        <Table>
          <THead><tr><TH>When</TH><TH>To</TH><TH>Kind</TH><TH>Subject & body</TH><TH>Status</TH></tr></THead>
          <tbody>
            {emails.map((e) => (
              <TR key={e.id}>
                <TD className="whitespace-nowrap font-mono text-[11px]">{fmtDate(e.createdAt)} {fmtTime(e.createdAt)}</TD>
                <TD className="text-xs">{e.to}</TD>
                <TD><Badge tone="gray">{e.kind.toLowerCase()}</Badge></TD>
                <TD className="max-w-xl text-xs">
                  <b>{e.subject}</b>
                  <details>
                    <summary className="cursor-pointer text-muted">body</summary>
                    <pre className="whitespace-pre-wrap font-sans">{e.body}</pre>
                  </details>
                </TD>
                <TD><Badge tone={e.status === "SENT" ? "green" : e.status === "FAILED" ? "red" : "yellow"}>{e.status.toLowerCase()}</Badge></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
