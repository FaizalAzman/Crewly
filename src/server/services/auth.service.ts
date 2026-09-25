import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { DomainError } from "../types";
import { bootstrapTenant } from "./bootstrap.service";

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
      trialEndsAt: new Date(Date.now() + 14 * 86400000),
      restDay: ["KEDAH", "KELANTAN", "TERENGGANU"].includes(data.state) ? 5 : 0,
      offDay: 6,
    },
  });
  await prisma.company.create({ data: { tenantId: tenant.id, name: data.companyName, state: data.state, isDefault: true } });
  await bootstrapTenant(tenant.id);
  const user = await prisma.user.create({
    data: { tenantId: tenant.id, email, name: data.name, role: "OWNER", passwordHash: await hashPassword(data.password) },
  });
  return { tenant, user };
}

export async function authenticate(emailRaw: string, password: string) {
  const email = emailRaw.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) throw new DomainError("Hmm, that email & password combo doesn't match.");
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw new DomainError("Hmm, that email & password combo doesn't match.");
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await prisma.auditLog.create({
    data: { tenantId: user.tenantId, userId: user.id, userName: user.name, action: "LOGIN", entity: "User", entityId: user.id, summary: `${user.name} signed in` },
  });
  return user;
}
