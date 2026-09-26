import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Callout, Card, CardBody, CardHeader, Field, Input, LinkButton, PageHeader, Select } from "@/components/ui";
import { PLANS, activeHeadcount, quoteFor, type PlanKey } from "@/server/services/subscription.service";
import { rm } from "@/lib/utils";
import { checkoutAction } from "../actions";

export const metadata: Metadata = { title: "Checkout" };

const FPX_BANKS = ["Maybank2u", "CIMB Clicks", "Public Bank", "RHB Now", "Hong Leong Connect", "AmOnline", "Bank Islam", "BSN", "OCBC", "UOB"];

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ plan?: string; cycle?: string }> }) {
  const ctx = await requireCtx("billing.manage");
  const sp = await searchParams;
  const plan = (sp.plan && sp.plan in PLANS ? sp.plan : "GROWTH") as PlanKey;
  const cycle = sp.cycle === "YEARLY" ? "YEARLY" : "MONTHLY";
  const [tenant, headcount] = await Promise.all([prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } }), activeHeadcount(ctx.tenantId)]);
  const q = quoteFor(plan, headcount, cycle);
  return (
    <>
      <PageHeader title="Checkout" emoji="💳" subtitle={`Subscribe ${tenant.name} to Crewly ${PLANS[plan].name}.`} actions={<LinkButton href="/settings?tab=billing" variant="secondary">← Plans</LinkButton>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader title="Payment" emoji="🏦" />
          <CardBody>
            <ActionForm action={checkoutAction} resetOnSuccess={false} className="space-y-4">
              <input type="hidden" name="plan" value={plan} />
              <input type="hidden" name="cycle" value={cycle} />
              <Field label="Payment method">
                <Select name="method" defaultValue="FPX" options={[{ value: "FPX", label: "FPX online banking" }, { value: "CARD", label: "Credit / debit card" }]} />
              </Field>
              <Field label="FPX bank" hint="Used when paying by FPX">
                <Select name="bank" options={FPX_BANKS} />
              </Field>
              <Field label="Card number" hint="Used when paying by card. Sandbox: any number works, and 4000 0000 0000 0002 simulates a decline.">
                <Input name="instrument" inputMode="numeric" placeholder="4242 4242 4242 4242" />
              </Field>
              <SubmitButton size="lg" className="w-full" pendingText="Processing payment…">
                Pay {rm(q.total)}
              </SubmitButton>
            </ActionForm>
            <div className="mt-4">
              <Callout tone="sky" emoji="🧪">
                <b>Sandbox gateway.</b> No money moves. Connect a real Malaysian gateway (Billplz, iPay88, Stripe) by implementing <code>PaymentGateway</code> in <code>subscription.service.ts</code>.
              </Callout>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Order summary" emoji="🧾" />
          <CardBody className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Plan</span><b>{PLANS[plan].name} · {cycle.toLowerCase()}</b></div>
            <div className="flex justify-between"><span>Seats</span><b>{q.seats} × {rm(q.price, { decimals: 0 })}/mo</b></div>
            {cycle === "YEARLY" && <div className="flex justify-between text-xs text-muted"><span>Yearly = 10 months (2 free)</span></div>}
            <div className="flex justify-between border-t-2 border-dashed border-soft-line pt-2"><span>Subtotal</span><span className="font-mono">{rm(q.subtotal)}</span></div>
            <div className="flex justify-between"><span>SST 8%</span><span className="font-mono">{rm(q.sst)}</span></div>
            <div className="flex justify-between border-t-2 border-ink pt-2 text-lg font-extrabold"><span>Total</span><span className="font-mono">{rm(q.total)}</span></div>
            <p className="pt-2 text-xs text-muted">Seats = active employees ({headcount}), minimum 10. {tenant.subscriptionStatus === "ACTIVE" ? "The new period starts when your current one ends." : "Your subscription starts today."}</p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
