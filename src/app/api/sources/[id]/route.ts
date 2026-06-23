// GET    /api/sources/[id] -> source metadata + extracted chunks
// DELETE /api/sources/[id] -> remove source (file + rows)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { deleteSource } from "@/lib/sources/service";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const source = await prisma.source.findUnique({
    where: { id },
    include: { chunks: { orderBy: { idx: "asc" } } },
  });
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    source: {
      id: source.id,
      analysisId: source.analysisId,
      kind: source.kind,
      filename: source.filename,
      extractionStatus: source.extractionStatus,
      byteSize: source.byteSize,
      uploadedAt: source.uploadedAt,
      chunks: source.chunks.map((c) => ({ idx: c.idx, page: c.page, text: c.text })),
    },
  });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  try {
    await deleteSource(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Delete failed." },
      { status: 500 },
    );
  }
}
