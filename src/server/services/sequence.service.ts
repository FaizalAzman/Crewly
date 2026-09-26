import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Next value of a per-tenant counter (ticket, grievance, case and invoice numbers). The increment is a single
 * atomic UPDATE, so two requests at the same moment never get the same number (unlike `count + 1`).
 * `seed` gives the number of existing records the first time a counter is used, so numbering carries on.
 */
export async function nextSequence(tenantId: string, key: string, seed: () => Promise<number>): Promise<number> {
  const where = { tenantId_key: { tenantId, key } };
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await prisma.sequence.findUnique({ where, select: { id: true } })) {
      return (await prisma.sequence.update({ where, data: { value: { increment: 1 } } })).value;
    }
    try {
      return (await prisma.sequence.create({ data: { tenantId, key, value: (await seed()) + 1 } })).value;
    } catch (e) {
      // Another request created the counter first; loop round and increment it instead.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
  }
  throw new Error(`Couldn't allocate the next ${key} number.`);
}
