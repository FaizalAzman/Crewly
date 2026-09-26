import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { isInManagerChain } from "../guard";
import { DomainError, type Ctx } from "../types";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ALLOWED_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/csv": "csv",
};

// turbopackIgnore: the path is only known at runtime, so don't trace the whole project into the server bundle.
export const storageRoot = () => process.env.UPLOAD_DIR ?? path.join(/* turbopackIgnore: true */ process.cwd(), "storage");

/** The file's leading bytes must match its declared type (browsers take the type from the file name). */
export function contentMatchesType(bytes: Uint8Array, mime: string) {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  const ascii = (at: number, text: string) => [...text].every((c, i) => bytes[at + i] === c.charCodeAt(0));
  switch (mime) {
    case "application/pdf":
      return ascii(0, "%PDF-");
    case "image/png":
      return starts(0x89, 0x50, 0x4e, 0x47);
    case "image/jpeg":
      return starts(0xff, 0xd8, 0xff);
    case "image/webp":
      return ascii(0, "RIFF") && ascii(8, "WEBP");
    case "image/heic":
      return ascii(4, "ftyp");
    case "application/msword":
      return starts(0xd0, 0xcf, 0x11, 0xe0);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return starts(0x50, 0x4b, 0x03, 0x04);
    case "text/csv":
      return !bytes.subarray(0, 512).includes(0); // plain text: no NUL bytes
    default:
      return false;
  }
}

/** Validates an upload before touching disk. Pure — unit tested. */
export function validateUpload(file: { name: string; size: number; type: string }) {
  if (!file.size) throw new DomainError("The file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) throw new DomainError("Files must be 5 MB or smaller.");
  if (!ALLOWED_MIME[file.type]) throw new DomainError("Upload a PDF, image (JPG/PNG/WebP/HEIC) or Word document.");
  const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(-80) || `file.${ALLOWED_MIME[file.type]}`;
  return { safeName };
}

export async function saveUpload(ctx: Ctx, file: File, purpose = "GENERAL") {
  return saveUploadForTenant(ctx.tenantId, file, purpose, ctx.userId);
}

/** Also used by the public careers page (no logged-in user). */
export async function saveUploadForTenant(tenantId: string, file: File, purpose: string, uploadedById: string | null) {
  const { safeName } = validateUpload(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!contentMatchesType(bytes, file.type)) throw new DomainError("That file's contents don't match its type. Re-save it as a PDF or image and try again.");
  const id = randomUUID();
  await mkdir(path.join(storageRoot(), tenantId), { recursive: true });
  const rel = path.join(tenantId, `${id}__${safeName}`);
  await writeFile(path.join(storageRoot(), rel), bytes);
  const up = await prisma.upload.create({
    data: { id, tenantId, fileName: safeName, mimeType: file.type, size: file.size, storagePath: rel, uploadedById, purpose },
  });
  return { id: up.id, url: `/api/files/${up.id}`, fileName: safeName };
}

/**
 * If the form carries a real file under `fileKey`, store it and return its URL;
 * otherwise fall back to the free-text value under `textKey` (e.g. an MC number or a link).
 */
export async function fileOrText(ctx: Ctx, fd: FormData, fileKey: string, textKey: string, purpose: string): Promise<string | null> {
  const f = fd.get(fileKey);
  if (f && typeof f === "object" && "size" in f && (f as File).size > 0) return (await saveUpload(ctx, f as File, purpose)).url;
  const t = fd.get(textKey);
  return typeof t === "string" && t.trim() ? t.trim() : null;
}

/**
 * Who may open an uploaded file (MCs and receipts can be sensitive personal data under PDPA 2010):
 * the uploader; the employee a document belongs to; anyone for letterhead artwork (it prints on every letter);
 * company-wide admins; team-scoped roles only for their reports' leave/claim attachments; recruiters for résumés.
 */
export async function canReadUpload(ctx: Ctx, up: { id: string; tenantId: string; uploadedById: string | null }) {
  if (up.tenantId !== ctx.tenantId) return false;
  if (up.uploadedById === ctx.userId) return true;
  const url = `/api/files/${up.id}`;
  const T = ctx.tenantId;
  const [letterhead, doc, leave, claim, resume] = await Promise.all([
    prisma.company.findFirst({ where: { tenantId: T, OR: [{ letterheadLogo: url }, { signatureImage: url }] }, select: { id: true } }),
    prisma.employeeDocument.findFirst({ where: { url, employee: { tenantId: T } }, select: { employeeId: true } }),
    prisma.leaveRequest.findFirst({ where: { tenantId: T, attachment: url }, select: { employeeId: true } }),
    prisma.claim.findFirst({ where: { tenantId: T, receiptUrl: url }, select: { employeeId: true } }),
    prisma.candidate.findFirst({ where: { tenantId: T, resumeUrl: url }, select: { id: true } }),
  ]);
  if (letterhead) return true;
  const owner = doc?.employeeId ?? leave?.employeeId ?? claim?.employeeId ?? null;
  if (owner && owner === ctx.employeeId) return true;
  if (resume && can(ctx, "recruitment.manage")) return true;
  if (ctx.permissions.length === 0) return false;
  if (ctx.scope === "ALL") return true;
  // Team-scoped roles: only leave and claim attachments of people in their reporting line.
  return !!owner && !!(leave || claim) && !!ctx.employeeId && (await isInManagerChain(ctx.employeeId, owner));
}

export async function readUpload(ctx: Ctx, id: string) {
  const up = await prisma.upload.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!up) return null;
  if (!(await canReadUpload(ctx, up))) return null;
  const data = await readFile(path.join(/* turbopackIgnore: true */ storageRoot(), up.storagePath));
  return { up, data };
}
