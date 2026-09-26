import { Paperclip } from "lucide-react";

/** Renders an attachment reference: uploaded files and URLs become links, plain text (e.g. an MC number) stays text. */
export function Attachment({ value, label }: { value: string | null | undefined; label?: string }) {
  if (!value) return null;
  const isLink = value.startsWith("/api/files/") || /^https?:\/\//.test(value);
  return isLink ? (
    <a href={value} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-grape underline underline-offset-2">
      <Paperclip size={12} /> {label ?? "View attachment"}
    </a>
  ) : (
    <span className="inline-flex items-center gap-1 text-muted">
      <Paperclip size={12} /> {value}
    </span>
  );
}
