"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { X } from "lucide-react";
import { btnClass } from "./ui";
import { toast } from "./toast";
import { cn } from "@/lib/utils";

export type ActionState = { ok: boolean; error?: string; message?: string; data?: unknown } | null;
type ServerAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export function SubmitButton({
  children,
  variant = "primary",
  className,
  pendingText = "Working on it…",
  size = "md",
  name,
  value,
}: {
  children: React.ReactNode;
  variant?: Parameters<typeof btnClass>[0];
  className?: string;
  pendingText?: string;
  size?: Parameters<typeof btnClass>[1];
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} name={name} value={value} className={cn(btnClass(variant, size), className)}>
      {pending ? pendingText : children}
    </button>
  );
}

/**
 * A <form> bound to a server action returning ActionState. Shows inline errors & toasts,
 * and calls onSuccess (e.g. to close a modal).
 */
export function ActionForm({
  action,
  children,
  className,
  onSuccess,
  resetOnSuccess = true,
  successMessage,
}: {
  action: ServerAction;
  children: React.ReactNode;
  className?: string;
  onSuccess?: (state: ActionState) => void;
  resetOnSuccess?: boolean;
  successMessage?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const last = useRef<ActionState>(null);
  useEffect(() => {
    if (!state || state === last.current) return;
    last.current = state;
    if (state.ok) {
      toast(state.message ?? successMessage ?? "Saved!", "success");
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.(state);
    } else if (state.error) {
      toast(state.error, "error");
    }
  }, [state, onSuccess, resetOnSuccess, successMessage]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {state && !state.ok && state.error && (
        <div className="mb-4 rounded-xl border-2 border-ink bg-cherry/15 px-3 py-2 text-sm font-semibold text-cherry">⚠️ {state.error}</div>
      )}
      {children}
    </form>
  );
}

/** Modal (native <dialog>) with a trigger button. Children can be a render-prop receiving close(). */
export function Modal({
  trigger,
  title,
  subtitle,
  children,
  wide,
  triggerVariant = "primary",
  triggerSize = "md",
  triggerClassName,
}: {
  trigger: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  wide?: boolean;
  triggerVariant?: Parameters<typeof btnClass>[0];
  triggerSize?: Parameters<typeof btnClass>[1];
  triggerClassName?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => {
    ref.current?.close();
    setOpen(false);
  };
  return (
    <>
      <button
        type="button"
        className={cn(btnClass(triggerVariant, triggerSize), triggerClassName)}
        onClick={() => {
          setOpen(true);
          ref.current?.showModal();
        }}
      >
        {trigger}
      </button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        className={cn(
          "m-auto w-[calc(100%-2rem)] rounded-3xl border-2 border-ink bg-paper p-0 text-ink shadow-brutal-lg",
          wide ? "max-w-3xl" : "max-w-lg",
        )}
      >
        {open && (
          <div className="pop-in">
            <div className="flex items-start justify-between border-b-2 border-ink bg-card px-6 py-4">
              <div>
                <h2 className="font-display text-xl font-extrabold">{title}</h2>
                {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
              </div>
              <button type="button" onClick={close} className="rounded-lg border-2 border-ink bg-card p-1 hover:bg-paper-2" aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="max-h-[75vh] overflow-y-auto px-6 py-5">{typeof children === "function" ? children(close) : children}</div>
          </div>
        )}
      </dialog>
    </>
  );
}

/** Modal + ActionForm in one — the most common pattern. */
export function FormModal({
  trigger,
  title,
  subtitle,
  action,
  children,
  submitLabel = "Save",
  wide,
  triggerVariant,
  triggerSize,
  triggerClassName,
}: {
  trigger: React.ReactNode;
  title: string;
  subtitle?: string;
  action: ServerAction;
  children: React.ReactNode;
  submitLabel?: string;
  wide?: boolean;
  triggerVariant?: Parameters<typeof btnClass>[0];
  triggerSize?: Parameters<typeof btnClass>[1];
  triggerClassName?: string;
}) {
  return (
    <Modal
      trigger={trigger}
      title={title}
      subtitle={subtitle}
      wide={wide}
      triggerVariant={triggerVariant}
      triggerSize={triggerSize}
      triggerClassName={triggerClassName}
    >
      {(close) => (
        <ActionForm action={action} onSuccess={close} className="space-y-4">
          {children}
          <div className="flex justify-end gap-2 border-t-2 border-dashed border-soft-line pt-4">
            <button type="button" className={btnClass("secondary")} onClick={close}>
              Cancel
            </button>
            <SubmitButton>{submitLabel}</SubmitButton>
          </div>
        </ActionForm>
      )}
    </Modal>
  );
}

/** Inline one-click action button (approve/reject/delete…) bound to a server action. */
export function ActionButton({
  action,
  fields,
  children,
  variant = "secondary",
  size = "sm",
  confirm,
  className,
}: {
  action: ServerAction;
  fields: Record<string, string>;
  children: React.ReactNode;
  variant?: Parameters<typeof btnClass>[0];
  size?: Parameters<typeof btnClass>[1];
  confirm?: string;
  className?: string;
}) {
  return (
    <ActionForm action={action} resetOnSuccess={false} className="inline">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <ConfirmSubmit variant={variant} size={size} confirm={confirm} className={className}>
        {children}
      </ConfirmSubmit>
    </ActionForm>
  );
}

function ConfirmSubmit({
  children,
  variant,
  size,
  confirm,
  className,
}: {
  children: React.ReactNode;
  variant: Parameters<typeof btnClass>[0];
  size: Parameters<typeof btnClass>[1];
  confirm?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(btnClass(variant, size), className)}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? "…" : children}
    </button>
  );
}
