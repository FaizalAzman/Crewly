"use server";

import { act } from "@/server/action";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { assertCan, audit } from "@/server/guard";
import { acknowledgeLetter, deleteLetter, generateLetter, issueLetter, updateLetter } from "@/server/services/culture.service";
import { boolField, dateField, fmtDate, optStr, str } from "@/lib/utils";
import { DomainError, type ActionState } from "@/server/types";
import { updateLetterhead } from "@/server/services/letterhead.service";
import { saveUpload } from "@/server/services/upload.service";

const P = ["/documents", "/me/documents", "/employees"];

export async function generateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("documents.manage");
  return act(async () => {
    const extra: Record<string, string> = {};
    const eff = dateField(fd, "effectiveDate");
    if (eff) extra.effectiveDate = fmtDate(eff, "long");
    const l = await generateLetter(ctx, str(fd, "templateId"), str(fd, "employeeId"), extra);
    if (str(fd, "issueNow") === "on") await issueLetter(ctx, l.id);
    return str(fd, "issueNow") === "on" ? "Letter generated and issued ✉️" : "Draft created. Review it, then issue it.";
  }, P);
}

export async function updateLetterAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("documents.manage");
  return act(async () => {
    await updateLetter(ctx, str(fd, "id"), str(fd, "content"), optStr(fd, "title") ?? undefined);
    return "Draft saved";
  }, P);
}

export async function issueLetterAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("documents.manage");
  return act(async () => {
    await issueLetter(ctx, str(fd, "id"));
    return "Issued. The employee has been notified.";
  }, P);
}

export async function deleteLetterAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("documents.manage");
  return act(async () => {
    await deleteLetter(ctx, str(fd, "id"));
    return "Draft deleted";
  }, P);
}

export async function ackLetterAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  return act(async () => {
    await acknowledgeLetter(ctx, str(fd, "id"));
    return "Acknowledged ✅";
  }, P);
}

export async function templateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("documents.manage");
  return act(async () => {
    const id = optStr(fd, "id");
    const data = { name: str(fd, "name"), category: str(fd, "category"), body: str(fd, "body") };
    if (!data.name || !data.body) throw new DomainError("Name and body are required.");
    if (id) await prisma.letterTemplate.update({ where: { id, tenantId: ctx.tenantId }, data });
    else await prisma.letterTemplate.create({ data: { ...data, tenantId: ctx.tenantId } });
    return "Template saved";
  }, P);
}

export async function policyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("documents.manage");
  return act(async () => {
    assertCan(ctx, "documents.manage");
    const id = optStr(fd, "id");
    const data = { title: str(fd, "title"), category: str(fd, "category"), content: str(fd, "content"), version: str(fd, "version") || "1.0", requiresAck: boolField(fd, "requiresAck") };
    if (!data.title || !data.content) throw new DomainError("Title and content are required.");
    if (id) {
      const old = await prisma.policy.findFirst({ where: { id, tenantId: ctx.tenantId } });
      if (!old) throw new DomainError("Policy not found.");
      const changed = old.content !== data.content;
      if (changed && data.version === old.version) throw new DomainError("The content changed, so bump the version number (e.g. 1.1).");
      await prisma.policy.update({ where: { id }, data: { ...data, publishedAt: changed ? new Date() : old.publishedAt } });
      if (changed && data.requiresAck) await prisma.policyAcknowledgement.deleteMany({ where: { policyId: id } });
      await audit(ctx, "UPDATE", "Policy", id, `Updated policy "${data.title}" to v${data.version}${changed ? " (re-acknowledgement required)" : ""}`);
      return changed ? `Published v${data.version}. Everyone must acknowledge it again.` : "Policy updated";
    }
    await prisma.policy.create({ data: { tenantId: ctx.tenantId, ...data } });
    return "Policy published. Employees will be asked to acknowledge it.";
  }, P);
}

async function imageUpload(ctx: Parameters<typeof saveUpload>[0], fd: FormData, key: string) {
  const f = fd.get(key);
  if (!f || typeof f !== "object" || (f as File).size === 0) return undefined;
  if (!["image/png", "image/jpeg"].includes((f as File).type)) throw new DomainError("Logos and signatures must be PNG or JPEG (so they embed in PDFs).");
  return (await saveUpload(ctx, f as File, "LETTERHEAD")).url;
}

export async function letterheadAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx("documents.manage");
  return act(async () => {
    await updateLetterhead(ctx, str(fd, "companyId"), {
      letterheadLogo: await imageUpload(ctx, fd, "logo"),
      signatureImage: await imageUpload(ctx, fd, "signature"),
      letterheadColor: str(fd, "letterheadColor") || undefined,
      letterheadLayout: str(fd, "letterheadLayout") || undefined,
      letterheadContact: optStr(fd, "letterheadContact"),
      letterheadFooter: optStr(fd, "letterheadFooter"),
      signatoryName: optStr(fd, "signatoryName"),
      signatoryTitle: optStr(fd, "signatoryTitle"),
      removeLogo: boolField(fd, "removeLogo"),
      removeSignature: boolField(fd, "removeSignature"),
    });
    return "Letterhead saved. All letters for this entity now use it.";
  }, P);
}
