import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Browser } from "playwright-core";
import { SESSION_COOKIE } from "@/lib/auth/session-token";

/**
 * Prints an app page (the /print/<kind>/<id> routes) to PDF with headless Chromium, so PDFs use exactly the same
 * components, CSS and fonts as the documents on screen.
 *
 * - The page is loaded from this server itself (PDF_RENDER_ORIGIN, default http://127.0.0.1:$PORT), never from the
 *   request's Host header, and Chromium may not contact any other host.
 * - It carries the requester's own session cookie, so the print page applies the same access rules.
 * - One browser is shared across requests (each render gets a fresh, isolated context), and at most
 *   PDF_RENDER_CONCURRENCY renders run at once to bound memory.
 *
 * Chromium comes from CHROMIUM_PATH, then $PLAYWRIGHT_BROWSERS_PATH/chromium, then Playwright's default location.
 */

const TIMEOUT_MS = 20_000;
const MAX_CONCURRENT = Math.max(1, Number(process.env.PDF_RENDER_CONCURRENCY ?? 3));

let browserPromise: Promise<Browser> | null = null;
let running = 0;
const waiting: (() => void)[] = [];

export function renderOrigin() {
  return new URL(process.env.PDF_RENDER_ORIGIN ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`);
}

function executablePath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const bundled = process.env.PLAYWRIGHT_BROWSERS_PATH && path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, "chromium");
  return bundled && existsSync(/* turbopackIgnore: true */ bundled) ? bundled : undefined;
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = import("playwright-core")
      .then(({ chromium }) => chromium.launch({ executablePath: executablePath(), args: ["--disable-dev-shm-usage"] }))
      .then((b) => {
        b.on("disconnected", () => (browserPromise = null));
        return b;
      })
      .catch((e) => {
        browserPromise = null;
        throw e;
      });
  }
  return browserPromise;
}

async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/** Renders `pathWithQuery` (e.g. "/print/payslip/abc") as an A4 PDF, signed in with `sessionToken`. */
export async function renderPdf(pathWithQuery: string, sessionToken: string): Promise<Buffer> {
  const origin = renderOrigin();
  const target = new URL(pathWithQuery, origin);
  return slot(async () => {
    const browser = await getBrowser();
    const context = await browser.newContext({ viewport: { width: 794, height: 1123 } });
    try {
      await context.addCookies([{ name: SESSION_COOKIE, value: sessionToken, domain: origin.hostname, path: "/", httpOnly: true, sameSite: "Lax" }]);
      // Only this server: no third-party fetches, and nothing can make Chromium carry the session elsewhere.
      await context.route("**/*", (route) => (new URL(route.request().url()).origin === origin.origin ? route.continue() : route.abort()));
      const page = await context.newPage();
      page.setDefaultTimeout(TIMEOUT_MS);
      const res = await page.goto(target.href, { waitUntil: "networkidle", timeout: TIMEOUT_MS });
      // A redirect (e.g. to /login) or an error page must never be printed as the document.
      if (!res || res.status() !== 200 || new URL(page.url()).pathname !== target.pathname) {
        throw new Error(`print page answered ${res?.status() ?? "nothing"} at ${new URL(page.url()).pathname}`);
      }
      await page.emulateMedia({ media: "screen" });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
      return Buffer.from(pdf);
    } finally {
      await context.close().catch(() => undefined);
    }
  });
}
