import { NextResponse, type NextRequest } from "next/server";
import { getCtx } from "@/server/context";
import { readUpload } from "@/server/services/upload.service";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { id } = await params;
  const file = await readUpload(ctx, id).catch(() => null);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.up.mimeType,
      "Content-Disposition": `inline; filename="${file.up.fileName}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
