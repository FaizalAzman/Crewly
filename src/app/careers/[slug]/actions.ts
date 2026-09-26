"use server";

import { prisma } from "@/lib/db";
import { applyToJob } from "@/server/services/talent.service";
import { saveUploadForTenant } from "@/server/services/upload.service";
import { DomainError, type ActionState } from "@/server/types";
import { optStr, str } from "@/lib/utils";

export async function applyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  // Honeypot: real people never fill this hidden field.
  if (str(fd, "website")) return { ok: true, message: "Thanks! Your application has been received." };
  try {
    const slug = str(fd, "slug");
    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new DomainError("Company not found.");
    let resumeUrl: string | null = null;
    const file = fd.get("resume");
    if (file && typeof file === "object" && (file as File).size > 0) {
      resumeUrl = (await saveUploadForTenant(tenant.id, file as File, "RESUME", null)).url;
    }
    const expected = str(fd, "expectedSalary");
    await applyToJob(slug, str(fd, "jobId"), {
      name: str(fd, "name"),
      email: str(fd, "email"),
      phone: optStr(fd, "phone"),
      expectedSalary: expected ? Number(expected) : null,
      noticePeriod: optStr(fd, "noticePeriod"),
      coverNote: optStr(fd, "coverNote"),
      resumeUrl,
    });
    return { ok: true, message: "Thanks! Your application has been received. We'll be in touch. 🎉" };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    throw e;
  }
}
