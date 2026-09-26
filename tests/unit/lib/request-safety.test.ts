import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/auth/safe-next";
import { contentMatchesType } from "@/server/services/upload.service";

describe("safeNext (post-login redirect)", () => {
  it("keeps same-site paths with their query", () => {
    expect(safeNext("/leave?tab=balances")).toBe("/leave?tab=balances");
    expect(safeNext("/employees/abc")).toBe("/employees/abc");
  });
  it("rejects external, protocol-relative and malformed targets", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "", null, undefined, "/ok\r\nSet-Cookie: x"]) {
      expect(safeNext(bad)).toBeNull();
    }
  });
  it("never loops back to the auth pages", () => {
    expect(safeNext("/login")).toBeNull();
    expect(safeNext("/reset-password?token=x")).toBeNull();
  });
});

describe("contentMatchesType (upload sniffing)", () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
  const text = (s: string) => new TextEncoder().encode(s);
  it("accepts real PDFs, PNGs and JPEGs", () => {
    expect(contentMatchesType(text("%PDF-1.7 ..."), "application/pdf")).toBe(true);
    expect(contentMatchesType(bytes(0x89, 0x50, 0x4e, 0x47), "image/png")).toBe(true);
    expect(contentMatchesType(bytes(0xff, 0xd8, 0xff, 0xe0), "image/jpeg")).toBe(true);
  });
  it("rejects a file whose bytes don't match the declared type", () => {
    expect(contentMatchesType(bytes(0x4d, 0x5a), "application/pdf")).toBe(false); // Windows executable renamed .pdf
    expect(contentMatchesType(text("<html><script>"), "image/png")).toBe(false);
    expect(contentMatchesType(bytes(0x00, 0x01), "text/csv")).toBe(false);
  });
});
