import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { prisma } from "@/lib/db";
import { act } from "@/server/action";
import { updateOwnProfile } from "@/server/services/employee.service";
import { ActionForm, FormModal, SubmitButton } from "@/components/forms";
import { btnClass, Callout, Card, CardBody, CardHeader, Checkbox, Field, Input, KV, PageHeader, Select, Table, TD, TH, THead, TR } from "@/components/ui";
import { BANKS, STATES, humanize, stateName } from "@/lib/constants";
import { ageOn, fmtDate, optStr, rm, str, todayMY } from "@/lib/utils";
import { maskNric } from "@/lib/nric";
import { childReliefTotal, pcbCategory } from "@/lib/statutory/pcb";
import type { ActionState } from "@/server/types";
import { changePasswordAction, logOutEverywhereAction } from "../../settings/actions";
import { addChildAction } from "../../employees/actions";

export const metadata: Metadata = { title: "My profile" };

async function profileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx();
  return act(async () => {
    await updateOwnProfile(ctx, {
      phone: optStr(fd, "phone"),
      address: optStr(fd, "address"),
      city: optStr(fd, "city"),
      postcode: optStr(fd, "postcode"),
      state: str(fd, "state") || undefined,
      emergencyName: optStr(fd, "emergencyName"),
      emergencyPhone: optStr(fd, "emergencyPhone"),
      emergencyRelation: optStr(fd, "emergencyRelation"),
    });
    return "Profile updated";
  }, ["/me/profile"]);
}

async function bankAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ctx = await requireCtx();
  return act(async () => {
    await updateOwnProfile(ctx, { bankName: optStr(fd, "bankName"), bankAccountNo: optStr(fd, "bankAccountNo") });
    return "Bank details updated. HR has been notified to verify them.";
  }, ["/me/profile"]);
}

export default async function MyProfilePage() {
  const ctx = await requireCtx();
  const e = await prisma.employee.findUniqueOrThrow({
    where: { id: ctx.employeeId! },
    include: { company: true, branch: true, department: true, manager: true, children: { orderBy: { dateOfBirth: "asc" } }, grade: true },
  });
  const today = todayMY();
  const kids = e.children.map((c) => ({ age: ageOn(c.dateOfBirth, today), studying: c.studying, disabled: c.disabled }));
  return (
    <>
      <PageHeader title="My profile" emoji="🪪" subtitle="Keep your contact, emergency and bank details up to date. Other changes go through HR." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Contact & emergency" emoji="📇" />
            <CardBody>
              <ActionForm action={profileAction} resetOnSuccess={false} className="grid gap-4 md:grid-cols-3">
                <Field label="Mobile"><Input name="phone" defaultValue={e.phone ?? ""} /></Field>
                <Field label="Address" className="md:col-span-2"><Input name="address" defaultValue={e.address ?? ""} /></Field>
                <Field label="City"><Input name="city" defaultValue={e.city ?? ""} /></Field>
                <Field label="Postcode"><Input name="postcode" defaultValue={e.postcode ?? ""} inputMode="numeric" /></Field>
                <Field label="State"><Select name="state" defaultValue={e.state} options={STATES.map((s) => ({ value: s.code, label: s.name }))} /></Field>
                <Field label="Emergency contact"><Input name="emergencyName" defaultValue={e.emergencyName ?? ""} /></Field>
                <Field label="Emergency phone"><Input name="emergencyPhone" defaultValue={e.emergencyPhone ?? ""} /></Field>
                <Field label="Relationship"><Input name="emergencyRelation" defaultValue={e.emergencyRelation ?? ""} /></Field>
                <div className="flex justify-end md:col-span-3"><SubmitButton>Save</SubmitButton></div>
              </ActionForm>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Salary bank account" emoji="🏦" subtitle="Changes are audited and HR is notified to verify them before payroll." />
            <CardBody>
              <ActionForm action={bankAction} resetOnSuccess={false} className="grid gap-4 md:grid-cols-3">
                <Field label="Bank"><Select name="bankName" defaultValue={e.bankName ?? ""} placeholder="—" options={BANKS} /></Field>
                <Field label="Account number"><Input name="bankAccountNo" defaultValue={e.bankAccountNo ?? ""} inputMode="numeric" /></Field>
                <div className="flex items-end justify-end"><SubmitButton variant="secondary">Update bank</SubmitButton></div>
              </ActionForm>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Spouse & children"
              emoji="👨‍👩‍👧"
              subtitle={`Used for your PCB tax reliefs: category ${pcbCategory(e.maritalStatus, e.spouseWorking, e.children.length)}, child relief ${rm(childReliefTotal(kids), { decimals: 0 })}`}
              action={
                <FormModal trigger="+ Add child" triggerSize="sm" title="Add child" action={addChildAction}>
                  <input type="hidden" name="employeeId" value={e.id} />
                  <Field label="Name"><Input name="name" required /></Field>
                  <Field label="Date of birth"><Input type="date" name="dateOfBirth" required /></Field>
                  <Checkbox name="studying" label="18+ and studying (diploma or higher)" />
                  <Checkbox name="disabled" label="Disabled (OKU)" />
                </FormModal>
              }
            />
            <CardBody>
              <p className="mb-3 text-sm">
                Marital status: <b>{humanize(e.maritalStatus)}</b>
                {e.maritalStatus === "MARRIED" && <> · spouse {e.spouseWorking ? "working" : "not working"}</>}. To change your marital status, raise a helpdesk ticket.
              </p>
              {e.children.length > 0 && (
                <Table>
                  <THead><tr><TH>Name</TH><TH>Age</TH><TH>Notes</TH></tr></THead>
                  <tbody>
                    {e.children.map((c) => (
                      <TR key={c.id}>
                        <TD className="font-semibold">{c.name}</TD>
                        <TD>{ageOn(c.dateOfBirth, today)}</TD>
                        <TD className="text-xs">{[c.studying && "Studying", c.disabled && "OKU"].filter(Boolean).join(", ") || "-"}</TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Employment (HR-managed)" emoji="💼" />
            <CardBody>
              <dl className="grid grid-cols-2 gap-4">
                <KV label="Employee no." value={e.employeeNo} mono />
                <KV label="MyKad" value={maskNric(e.icNo)} mono />
                <KV label="Job title" value={e.jobTitle} />
                <KV label="Department" value={e.department?.name} />
                <KV label="Manager" value={e.manager?.fullName ?? "-"} />
                <KV label="Location" value={e.branch ? `${e.branch.name}` : stateName(e.company.state)} />
                <KV label="Joined" value={fmtDate(e.joinDate, "long")} />
                <KV label="Type" value={humanize(e.employmentType)} />
                <KV label="EPF no." value={e.epfNo} mono />
                <KV label="Tax no." value={e.taxNo} mono />
              </dl>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Change password" emoji="🔐" />
            <CardBody>
              <ActionForm action={changePasswordAction} className="space-y-3">
                <Field label="Current password"><Input type="password" name="current" required autoComplete="current-password" /></Field>
                <Field label="New password" hint="At least 8 characters"><Input type="password" name="next" required minLength={8} autoComplete="new-password" /></Field>
                <Field label="Confirm new password"><Input type="password" name="confirm" required minLength={8} autoComplete="new-password" /></Field>
                <SubmitButton className="w-full">Change password</SubmitButton>
              </ActionForm>
              <form action={logOutEverywhereAction} className="mt-4 border-t-2 border-soft-line pt-4">
                <p className="mb-2 text-xs text-muted">Lost a phone or used a shared computer? End every session, including this one.</p>
                <button type="submit" className={btnClass("secondary", "sm")}>
                  Log out of all devices
                </button>
              </form>
            </CardBody>
          </Card>
          <Callout emoji="🛡️">Under PDPA 2010 you may request access to, or correction of, any personal data we hold. Use the helpdesk for anything you can&apos;t edit here.</Callout>
        </div>
      </div>
    </>
  );
}
