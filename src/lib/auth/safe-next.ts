/** Post-login destination from `?next=`. Only same-site relative paths are honoured, so it can't become an open redirect. */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || /[\r\n\t]/.test(next)) return null;
  if (/^\/(login|signup|forgot-password|reset-password)(\/|\?|$)/.test(next)) return null;
  return next;
}
