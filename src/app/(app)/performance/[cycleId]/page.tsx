import { notFound } from "next/navigation";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { Badge, Card, CardHeader, Field, Input, LinkButton, PageHeader, PersonCell, Select, StatusBadge, Table, TD, TH, THead, TR, Textarea } from "@/components/ui";
import { FormModal } from "@/components/forms";
import { DistributionChart } from "@/components/charts";
import { RATING_LABELS, weightedGoalScore } from "@/server/services/talent.service";
import { fmtDate } from "@/lib/utils";
import { calibrateAction, managerReviewAction } from "../actions";

export default async function CyclePage({ params }: { params: Promise<{ cycleId: string }> }) {
  const ctx = await requireCtx("performance.review");
  const { cycleId } = await params;
  const cycle = await prisma.reviewCycle.findFirst({ where: { id: cycleId, tenantId: ctx.tenantId } });
  if (!cycle) notFound();
  const reviews = await prisma.performanceReview.findMany({
    where: { cycleId, ...(ctx.role === "MANAGER" ? { reviewerId: ctx.userId } : {}) },
    include: { employee: { include: { department: true, goals: { where: { cycleId } } } } },
    orderBy: { employee: { fullName: "asc" } },
  });
  const manage = can(ctx.role, "performance.manage");
  const dist = [1, 2, 3, 4, 5].map((r) => ({ name: `${r}`, value: reviews.filter((x) => x.finalRating != null && Math.round(x.finalRating) === r).length, highlight: r === 1 || r === 5 }));
  const ratingOpts = [1, 2, 3, 4, 5].map((v) => ({ value: String(v), label: `${v} · ${RATING_LABELS[v]}` }));

  return (
    <>
      <PageHeader title={cycle.name} emoji="🎯" subtitle={`${fmtDate(cycle.startDate, "long")} – ${fmtDate(cycle.endDate, "long")} · final rating = 70% manager + 30% goal achievement`} actions={<LinkButton href="/performance" variant="secondary">← Performance</LinkButton>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Reviews" emoji="📝" />
          <Table>
            <THead>
              <tr><TH>Employee</TH><TH>Goals</TH><TH>Self</TH><TH>Manager</TH><TH>Final</TH><TH>Status</TH><TH /></tr>
            </THead>
            <tbody>
              {reviews.map((r) => {
                const score = weightedGoalScore(r.employee.goals);
                return (
                  <TR key={r.id}>
                    <TD><PersonCell name={r.employee.fullName} sub={r.employee.department?.name} color={r.employee.avatarColor} /></TD>
                    <TD className="text-xs">{r.employee.goals.length ? `${score.toFixed(0)}% achieved` : "No goals"}</TD>
                    <TD>{r.selfRating ?? "-"}</TD>
                    <TD>{r.managerRating ?? "-"}</TD>
                    <TD>{r.finalRating != null ? <Badge tone={r.finalRating >= 4 ? "green" : r.finalRating < 2.5 ? "red" : "gray"}>{r.finalRating}</Badge> : "-"}</TD>
                    <TD><StatusBadge status={r.status} /></TD>
                    <TD>
                      {r.status === "MANAGER_REVIEW" && r.employeeId !== ctx.employeeId && (
                        <FormModal trigger="Review" triggerSize="sm" title={`Review · ${r.employee.fullName}`} subtitle={r.selfComment ? `Self (${r.selfRating}/5): "${r.selfComment}"` : undefined} action={managerReviewAction}>
                          <input type="hidden" name="reviewId" value={r.id} />
                          <input type="hidden" name="cycleId" value={cycleId} />
                          <Field label="Rating"><Select name="rating" defaultValue="3" options={ratingOpts} /></Field>
                          <Field label="Summary"><Textarea name="comment" required /></Field>
                          <Field label="Strengths"><Input name="strengths" /></Field>
                          <Field label="Areas to improve"><Input name="improvements" /></Field>
                        </FormModal>
                      )}
                      {r.status === "CALIBRATION" && manage && (
                        <FormModal trigger="Calibrate" triggerSize="sm" triggerVariant="grape" title={`Calibrate · ${r.employee.fullName}`} subtitle={`Suggested ${r.finalRating} (manager ${r.managerRating}, goals ${score.toFixed(0)}%)`} action={calibrateAction}>
                          <input type="hidden" name="reviewId" value={r.id} />
                          <input type="hidden" name="cycleId" value={cycleId} />
                          <Field label="Final rating"><Input type="number" step="0.5" min={1} max={5} name="finalRating" defaultValue={r.finalRating ?? 3} /></Field>
                        </FormModal>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Rating distribution" emoji="📊" subtitle="Final ratings so far" />
          <div className="p-4"><DistributionChart data={dist} /></div>
        </Card>
      </div>
    </>
  );
}
