import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui";
import { Logo } from "@/components/logo";
import { humanize } from "@/lib/constants";
import { fmtDate, rm } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const t = await prisma.tenant.findUnique({ where: { slug: (await params).slug } });
  return { title: t ? `Careers at ${t.name}` : "Careers" };
}

export default async function CareersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) notFound();
  const jobs = await prisma.jobOpening.findMany({ where: { tenantId: tenant.id, status: "OPEN" }, include: { department: true }, orderBy: { createdAt: "desc" } });
  return (
    <div className="bg-dots min-h-screen">
      <header className="border-b-2 border-ink bg-grape text-white">
        <div className="mx-auto max-w-4xl px-4 py-14">
          <p className="text-xs font-bold uppercase tracking-widest text-white/80">Careers</p>
          <h1 className="font-display mt-2 text-5xl font-extrabold">Work at {tenant.name}</h1>
          <p className="mt-3 max-w-xl text-white/85">We&apos;re hiring. Find a role you&apos;ll love and apply in two minutes.</p>
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-4 px-4 py-10">
        {jobs.length === 0 && <p className="rounded-2xl border-2 border-ink bg-card p-8 text-center font-semibold shadow-brutal">No open roles right now. Check back soon!</p>}
        {jobs.map((j) => (
          <Link key={j.id} href={`/careers/${slug}/${j.id}`} className="press block rounded-2xl border-2 border-ink bg-card p-5 shadow-brutal">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-display text-xl font-extrabold">{j.title}</p>
                <p className="text-sm text-ink-2">
                  {j.department?.name ?? "General"} · {j.location} · {humanize(j.workMode)} · {humanize(j.employmentType)}
                </p>
              </div>
              {j.salaryMin && <Badge tone="lime">{rm(j.salaryMin, { decimals: 0 })} – {rm(j.salaryMax ?? j.salaryMin, { decimals: 0 })}</Badge>}
            </div>
            {j.closingDate && <p className="mt-2 text-xs text-muted">Apply by {fmtDate(j.closingDate, "long")}</p>}
          </Link>
        ))}
      </main>
      <footer className="pb-10 text-center">
        <span className="text-xs text-muted">Powered by</span> <Logo className="scale-75" />
      </footer>
    </div>
  );
}
