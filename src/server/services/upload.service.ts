import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
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

export const storageRoot = () => process.env.UPLOAD_DIR ?? path.join(process.cwd(), "storage");

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
  const id = randomUUID();
  await mkdir(path.join(storageRoot(), tenantId), { recursive: true });
  const rel = path.join(tenantId, `${id}__${safeName}`);
  await writeFile(path.join(storageRoot(), rel), Buffer.from(await file.arrayBuffer()));
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

/** Access rule: same tenant, and either the uploader or someone with any administrative permission. */
export async function readUpload(ctx: Ctx, id: string) {
  const up = await prisma.upload.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!up) return null;
  if (up.uploadedById !== ctx.userId && ctx.permissions.length === 0) return null;
  const data = await readFile(path.join(storageRoot(), up.storagePath));
  return { up, data };
}
