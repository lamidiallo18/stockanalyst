// GET  /api/sources?analysisId=  -> list sources (optionally scoped)
// POST /api/sources               -> multipart upload, stores + extracts async
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSource } from "@/lib/sources/service";

export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

export async function GET(req: NextRequest) {
  const analysisId = req.nextUrl.searchParams.get("analysisId") ?? undefined;
  const sources = await prisma.source.findMany({
    where: analysisId ? { analysisId } : {},
    orderBy: { uploadedAt: "desc" },
    include: { _count: { select: { chunks: true } } },
  });
  return NextResponse.json({
    sources: sources.map((s) => ({
      id: s.id,
      analysisId: s.analysisId,
      kind: s.kind,
      filename: s.filename,
      mimeType: s.mimeType,
      byteSize: s.byteSize,
      extractionStatus: s.extractionStatus,
      chunkCount: s._count.chunks,
      uploadedAt: s.uploadedAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }
  const file = form.get("file");
  const analysisId = (form.get("analysisId") as string) || undefined;
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 25 MB)." }, { status: 413 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const source = await createSource({
      buffer,
      filename: file.name,
      mime: file.type,
      analysisId,
    });
    return NextResponse.json({
      source: {
        id: source.id,
        kind: source.kind,
        filename: source.filename,
        extractionStatus: source.extractionStatus,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed." },
      { status: 500 },
    );
  }
}
