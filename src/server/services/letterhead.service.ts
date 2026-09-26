import { prisma } from "@/lib/db";
import { assertCan, audit } from "../guard";
import { DomainError, type Ctx } from "../types";

export interface LetterheadInput {
  letterheadLogo?: string | null;
  letterheadColor?: string;
  letterheadLayout?: string;
  letterheadContact?: string | null;
  letterheadFooter?: string | null;
  signatoryName?: string | null;
  signatoryTitle?: string | null;
  signatureImage?: string | null;
  removeLogo?: boolean;
  removeSignature?: boolean;
}

/** Pure validation — unit tested. */
export function validateLetterhead(input: LetterheadInput) {
  if (input.letterheadColor && !/^#[0-9a-fA-F]{6}$/.test(input.letterheadColor)) throw new DomainError("Colour must be a hex value like #16140F.");
  if (input.letterheadLayout && !["LEFT", "CENTER", "RIGHT"].includes(input.letterheadLayout)) throw new DomainError("Layout must be left, centre or right.");
  if ((input.letterheadFooter ?? "").length > 300) throw new DomainError("Footer is limited to 300 characters.");
  if ((input.letterheadContact ?? "").length > 150) throw new DomainError("Contact line is limited to 150 characters.");
}

/**
 * Letterhead is stored per legal entity and applied when a letter is rendered, so a change here updates
 * every letter (past and future) for that entity.
 */
export async function updateLetterhead(ctx: Ctx, companyId: string, input: LetterheadInput) {
  assertCan(ctx, "documents.manage");
  const company = await prisma.company.findFirst({ where: { id: companyId, tenantId: ctx.tenantId } });
  if (!company) throw new DomainError("Legal entity not found.");
  validateLetterhead(input);
  const data = {
    letterheadColor: input.letterheadColor ?? company.letterheadColor,
    letterheadLayout: input.letterheadLayout ?? company.letterheadLayout,
    letterheadContact: input.letterheadContact ?? null,
    letterheadFooter: input.letterheadFooter ?? null,
    signatoryName: input.signatoryName ?? null,
    signatoryTitle: input.signatoryTitle ?? null,
    letterheadLogo: input.removeLogo ? null : (input.letterheadLogo ?? company.letterheadLogo),
    signatureImage: input.removeSignature ? null : (input.signatureImage ?? company.signatureImage),
  };
  const updated = await prisma.company.update({ where: { id: companyId }, data });
  await audit(ctx, "UPDATE", "Company", companyId, `Updated letterhead for ${company.name}`);
  return updated;
}
