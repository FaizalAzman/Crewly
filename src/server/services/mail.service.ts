import { prisma } from "@/lib/db";

export interface MailInput {
  to: string;
  subject: string;
  body: string;
  kind?: "WELCOME" | "RESET" | "INVITE" | "TRIAL" | "BILLING" | "GENERAL";
  tenantId?: string | null;
}

export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

/**
 * Every outbound email is written to the OutboundEmail log (visible in the platform console).
 * To deliver for real, implement `deliver()` with your provider (SMTP, Resend, SES, Postmark…) and set
 * MAIL_PROVIDER. Without a provider the message is logged only, which is fine for development.
 */
export async function sendMail(input: MailInput) {
  const row = await prisma.outboundEmail.create({
    data: { to: input.to, subject: input.subject, body: input.body, kind: input.kind ?? "GENERAL", tenantId: input.tenantId ?? null, status: "QUEUED" },
  });
  try {
    const delivered = await deliver(input);
    await prisma.outboundEmail.update({ where: { id: row.id }, data: { status: delivered ? "SENT" : "LOGGED" } });
  } catch (e) {
    await prisma.outboundEmail.update({ where: { id: row.id }, data: { status: "FAILED", error: e instanceof Error ? e.message : String(e) } });
  }
  return row;
}

async function deliver(input: MailInput): Promise<boolean> {
  if (!process.env.MAIL_PROVIDER) {
    if (process.env.NODE_ENV !== "test") console.info(`[mail] to=${input.to} subject="${input.subject}"`);
    return false;
  }
  // Provider integration point, e.g. fetch("https://api.resend.com/emails", …) using MAIL_API_KEY.
  throw new Error(`Mail provider "${process.env.MAIL_PROVIDER}" is not implemented yet`);
}
