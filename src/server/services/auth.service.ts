import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { DomainError } from "../types";
import { claimTransition } from "../guard";
import { bootstrapTenant } from "./bootstrap.service";
import { createHash, randomBytes } from "node:crypto";
import { appUrl, sendMail } from "./mail.service";
import { TRIAL_DAYS, tenantAccess } from "./subscription.service";

export const signupSchema = z.object({
  companyName: z.string().min(2, "Company name is too short"),
  name: z.string().min(2, "Tell us your name"),
  email: z.string().email("That email looks off"),
  password: z.string().min(8, "Password needs at least 8 characters"),
  state: z.string().default("SELANGOR"),
  headcount: z.coerce.number().int().min(1).default(20),
});

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/sdn\.? bhd\.?|berhad|plt/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "workspace";
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function signup(input: z.input<typeof signupSchema>) {
  const data = signupSchema.parse(input);
  const email = data.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) throw new DomainError("That email already has a workspace. Log in instead?");

  let slug = slugify(data.companyName);
  if (await prisma.tenant.findUnique({ where: { slug } })) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  const tenant = await prisma.tenant.create({
    data: {
      name: data.companyName,
      slug,
      plan: "GROWTH",
      seats: Math.max(10, data.headcount),
      trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86400000),
      subscriptionStatus: "TRIALING",
      restDay: ["KEDAH", "KELANTAN", "TERENGGANU"].includes(data.state) ? 5 : 0,
      offDay: 6,
    },
  });
  await prisma.company.create({ data: { tenantId: tenant.id, name: data.companyName, state: data.state, isDefault: true } });
  await bootstrapTenant(tenant.id);
  const user = await prisma.user.create({
    data: { tenantId: tenant.id, email, name: data.name, role: "OWNER", passwordHash: await hashPassword(data.password) },
  });
  await sendMail({
    tenantId: tenant.id,
    to: email,
    kind: "WELCOME",
    subject: "Welcome to Crewly: your workspace is ready",
    body: `Hi ${data.name},\n\nYour ${data.companyName} workspace is live, with a ${TRIAL_DAYS}-day free trial.\n\nFinish setup (company numbers, work week, first employees) here: ${appUrl()}/welcome\n\nThe Crewly team`,
  });
  return { tenant, user };
}

export async function authenticate(emailRaw: string, password: string) {
  const email = emailRaw.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email }, include: { tenant: true } });
  if (!user || !user.active) throw new DomainError("That email and password don't match.");
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw new DomainError("That email and password don't match.");
  const access = tenantAccess(user.tenant);
  if (!access.canLogin && !user.platformAdmin) throw new DomainError(access.message);
  const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await prisma.auditLog.create({
    data: { tenantId: user.tenantId, userId: user.id, userName: user.name, action: "LOGIN", entity: "User", entityId: user.id, summary: `${user.name} signed in` },
  });
  return updated;
}

// ───────────── Password reset & invitations ─────────────

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Creates a single-use token (only its hash is stored) and returns the raw token. */
export async function issueToken(userId: string, purpose: "RESET" | "INVITE", ttlHours: number) {
  const token = randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({ data: { userId, tokenHash: hashToken(token), purpose, expiresAt: new Date(Date.now() + ttlHours * 3600000) } });
  return token;
}

/**
 * Always behaves the same whether or not the email exists (no account enumeration).
 * Returns a dev-only link so the flow can be tested without an email provider.
 */
export async function requestPasswordReset(emailRaw: string): Promise<{ devLink?: string }> {
  const email = emailRaw.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) return {};
  const recent = await prisma.passwordResetToken.count({ where: { userId: user.id, purpose: "RESET", createdAt: { gte: new Date(Date.now() - 15 * 60000) } } });
  if (recent >= 3) return {}; // throttle
  const token = await issueToken(user.id, "RESET", 1);
  const link = `${appUrl()}/reset-password?token=${token}`;
  await sendMail({ tenantId: user.tenantId, to: email, kind: "RESET", subject: "Reset your Crewly password", body: `Hi ${user.name},\n\nUse this link within 1 hour to set a new password:\n${link}\n\nIf you didn't ask for this, you can ignore this email.` });
  return process.env.NODE_ENV === "production" ? {} : { devLink: `/reset-password?token=${token}` };
}

export async function resetPassword(token: string, newPassword: string) {
  if (newPassword.length < 8) throw new DomainError("Password must be at least 8 characters.");
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!row || row.usedAt || row.expiresAt < new Date()) throw new DomainError("This link is invalid or has expired. Request a new one.");
  if (!row.user.active) throw new DomainError("This account is disabled.");
  // Spend the token first (compare-and-set), so the same link can't be used twice at once.
  await claimTransition(prisma.passwordResetToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } }), "This link has already been used. Request a new one.");
  await prisma.user.update({ where: { id: row.userId }, data: { passwordHash: await hashPassword(newPassword), sessionVersion: { increment: 1 } } });
  await prisma.passwordResetToken.updateMany({ where: { userId: row.userId, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.auditLog.create({ data: { tenantId: row.user.tenantId, userId: row.userId, userName: row.user.name, action: "UPDATE", entity: "User", entityId: row.userId, summary: `${row.user.name} ${row.purpose === "INVITE" ? "accepted an invitation" : "reset their password"}` } });
  return row.user;
}

/** Sends a "set your password" invitation (valid 7 days). */
export async function sendInvite(userId: string, invitedBy: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { tenant: true } });
  const token = await issueToken(user.id, "INVITE", 24 * 7);
  const link = `${appUrl()}/reset-password?token=${token}&invite=1`;
  await sendMail({ tenantId: user.tenantId, to: user.email, kind: "INVITE", subject: `${invitedBy} invited you to ${user.tenant.name} on Crewly`, body: `Hi ${user.name},\n\n${invitedBy} has given you access to ${user.tenant.name} on Crewly. Set your password within 7 days:\n${link}` });
  return process.env.NODE_ENV === "production" ? undefined : `/reset-password?token=${token}&invite=1`;
}
