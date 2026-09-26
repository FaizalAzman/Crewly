import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { setupProgress } from "@/server/services/onboarding.service";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Callout, Card, CardBody, CardHeader, Field, Input, LinkButton, PageHeader, Progress, Select, Textarea } from "@/components/ui";
import { STATES } from "@/lib/constants";
import { todayMY } from "@/lib/utils";
import { companyStepAction, finishAction, profileStepAction, structureStepAction } from "./actions";
import { inviteAction } from "../settings/actions";
import { assignableRoles } from "@/server/services/roles.service";

export const metadata: Metadata = { title: "Set up your workspace" };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, i) => ({ value: String(i), label: d }));

export default async function WelcomePage() {
  const ctx = await requireCtx("settings.manage");
  const [tenant, company, progress, roleOptions] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } }),
    prisma.company.findFirst({ where: { tenantId: ctx.tenantId, isDefault: true } }),
    setupProgress(ctx.tenantId, ctx.userId),
    assignableRoles(ctx),
  ]);
  const step = (key: string) => progress.steps.find((s) => s.key === key)!;
  const Status = ({ k }: { k: string }) => (step(k).done ? <span className="rounded-full border-2 border-ink bg-mint px-2 text-xs font-bold">Done ✓</span> : <span className="rounded-full border-2 border-ink bg-sunny px-2 text-xs font-bold">To do</span>);

  return (
    <>
      <PageHeader kicker={`${tenant.name} · setup`} title="Let's get you set up" emoji="🚀" subtitle="Six short steps. You can skip any of them and come back later. Everything is editable afterwards." />
      <div className="mb-8 rounded-2xl border-2 border-ink bg-card p-5 shadow-brutal">
        <div className="flex items-center justify-between text-sm font-bold">
          <span>{progress.done} of {progress.total} steps done</span>
          <span>{progress.percent}%</span>
        </div>
        <Progress value={progress.percent} className="mt-2" />
        <ol className="mt-4 grid gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
          {progress.steps.map((s, i) => (
            <li key={s.key} className={`rounded-xl border-2 border-ink px-2 py-1.5 font-semibold ${s.done ? "bg-mint" : "bg-paper-2"}`}>
              {i + 1}. {s.title}
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="1. Company & statutory numbers" emoji="🏛️" subtitle={step("company").hint} action={<Status k="company" />} />
          <CardBody>
            <ActionForm action={companyStepAction} resetOnSuccess={false} className="grid gap-3 md:grid-cols-2">
              <Field label="Registered company name" className="md:col-span-2"><Input name="name" defaultValue={company?.name} /></Field>
              <Field label="SSM registration no." required><Input name="regNo" defaultValue={company?.regNo ?? ""} placeholder="202001012345 (1234567-A)" /></Field>
              <Field label="KWSP employer no." required><Input name="epfNo" defaultValue={company?.epfNo ?? ""} /></Field>
              <Field label="PERKESO employer code" required><Input name="socsoNo" defaultValue={company?.socsoNo ?? ""} /></Field>
              <Field label="LHDN employer no. (E)" required><Input name="taxNo" defaultValue={company?.taxNo ?? ""} placeholder="E 1234567890" /></Field>
              <Field label="HRD Corp MyCoID"><Input name="hrdfNo" defaultValue={company?.hrdfNo ?? ""} /></Field>
              <Field label="Phone"><Input name="phone" defaultValue={company?.phone ?? ""} /></Field>
              <Field label="Address" className="md:col-span-2"><Input name="address" defaultValue={company?.address ?? ""} /></Field>
              <Field label="Work week"><Select name="workDaysPerWeek" defaultValue={String(tenant.workDaysPerWeek)} options={[{ value: "5", label: "5 days" }, { value: "5.5", label: "5.5 days" }, { value: "6", label: "6 days" }]} /></Field>
              <Field label="Rest day"><Select name="restDay" defaultValue={String(tenant.restDay)} options={DAYS} /></Field>
              <Field label="Off day"><Select name="offDay" defaultValue={tenant.offDay === null ? "" : String(tenant.offDay)} placeholder="None" options={DAYS} /></Field>
              <Field label="Pay day (of month)"><Input type="number" name="payDay" defaultValue={tenant.payDay} min={1} max={28} /></Field>
              <div className="flex justify-end md:col-span-2"><SubmitButton>Save</SubmitButton></div>
            </ActionForm>
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="2. Departments & locations" emoji="🧩" subtitle={step("structure").hint} action={<Status k="structure" />} />
            <CardBody>
              <ActionForm action={structureStepAction} className="space-y-3">
                <Field label="Departments" hint="Comma or line separated"><Textarea name="departments" rows={2} placeholder="Engineering, Sales, Finance, People" /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Main office / branch"><Input name="branchName" placeholder="HQ Kuala Lumpur" /></Field>
                  <Field label="State"><Select name="branchState" defaultValue={company?.state} options={STATES.map((s) => ({ value: s.code, label: s.name }))} /></Field>
                </div>
                <SubmitButton variant="secondary">Add</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="3. Your own profile" emoji="🙋" subtitle={step("profile").hint} action={<Status k="profile" />} />
            <CardBody>
              {step("profile").done ? (
                <p className="text-sm">You&apos;re set up as an employee. Visit <b>Me</b> anytime.</p>
              ) : (
                <ActionForm action={profileStepAction} className="grid gap-3 md:grid-cols-2">
                  <Field label="Full name (as per MyKad)"><Input name="fullName" defaultValue={ctx.userName} /></Field>
                  <Field label="MyKad"><Input name="icNo" placeholder="900101-14-5678" /></Field>
                  <Field label="Job title"><Input name="jobTitle" defaultValue="Founder" /></Field>
                  <Field label="Join date"><Input type="date" name="joinDate" defaultValue={todayMY().toISOString().slice(0, 10)} /></Field>
                  <Field label="Basic salary (RM)"><Input type="number" name="basicSalary" defaultValue="5000" /></Field>
                  <div className="flex items-end"><SubmitButton variant="secondary">Create my profile</SubmitButton></div>
                </ActionForm>
              )}
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader title="4. Add your employees" emoji="🧑‍🤝‍🧑" subtitle={step("people").hint} action={<Status k="people" />} />
          <CardBody className="flex flex-wrap gap-2">
            <LinkButton href="/employees/import" variant="lime">Import from CSV</LinkButton>
            <LinkButton href="/employees/new" variant="secondary">Add one by one</LinkButton>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="5. Invite your team" emoji="✉️" subtitle={step("team").hint} action={<Status k="team" />} />
          <CardBody>
            <ActionForm action={inviteAction} className="grid gap-3 md:grid-cols-2">
              <Field label="Name"><Input name="name" required /></Field>
              <Field label="Email"><Input type="email" name="email" required /></Field>
              <Field label="Role"><Select name="role" defaultValue="HR_ADMIN" options={roleOptions} /></Field>
              <Field label="Temporary password" hint="They'll also get a set-password email"><Input name="password" defaultValue={`Welcome${new Date().getFullYear()}!`} /></Field>
              <div className="md:col-span-2"><SubmitButton variant="secondary">Send invite</SubmitButton></div>
            </ActionForm>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="6. Run your first payroll" emoji="💸" subtitle={step("payroll").hint} action={<Status k="payroll" />} />
          <CardBody className="space-y-3">
            <LinkButton href="/payroll" variant="secondary">Go to payroll</LinkButton>
            <Callout emoji="💡">Tip: run a payroll for last month first to check that the figures match your current system.</Callout>
          </CardBody>
        </Card>
      </div>

      <div className="mt-8 flex justify-end">
        <ActionForm action={finishAction} resetOnSuccess={false}>
          <SubmitButton size="lg">{progress.done === progress.total ? "Finish setup 🎉" : "I'm done for now → dashboard"}</SubmitButton>
        </ActionForm>
      </div>
    </>
  );
}
