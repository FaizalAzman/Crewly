import { FileDown, Eye } from "lucide-react";
import { btnClass } from "./ui";

/** Links to a server-generated (true) PDF. */
export function PdfButton({ href, label = "Download PDF", preview = true }: { href: string; label?: string; preview?: boolean }) {
  const sep = href.includes("?") ? "&" : "?";
  return (
    <span className="inline-flex gap-2">
      {preview && (
        <a href={`${href}${sep}inline=1`} target="_blank" rel="noreferrer" className={btnClass("secondary")}>
          <Eye size={15} /> View PDF
        </a>
      )}
      <a href={href} className={btnClass("primary")}>
        <FileDown size={15} /> {label}
      </a>
    </span>
  );
}
