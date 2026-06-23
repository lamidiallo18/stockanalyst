// Source service — orchestrates upload → store → async extract → chunk →
// persist, and provides analysis-scoped retrieval over extracted chunks.
import "server-only";
import { prisma } from "@/lib/db";
import { storeFile, readFile, deleteFile } from "./storage";
import { classify, extract } from "./extract";
import { chunkSegments } from "./chunk";
import { retrieve, type RetrievableChunk, type ScoredChunk } from "./retrieve";

const inFlight = new Set<Promise<unknown>>();

export interface CreateSourceInput {
  buffer: Buffer;
  filename: string;
  mime?: string;
  analysisId?: string;
}

export async function createSource(input: CreateSourceInput) {
  const stored = await storeFile(input.buffer, input.filename, input.mime);
  const kind = classify(input.filename, input.mime);

  const source = await prisma.source.create({
    data: {
      analysisId: input.analysisId,
      kind,
      filename: input.filename,
      storagePath: stored.storagePath,
      sha256: stored.sha256,
      mimeType: input.mime,
      byteSize: stored.byteSize,
      extractionStatus: "PENDING",
    },
  });

  // Extract + chunk in the background; status is observable on the Source row.
  const p = extractAndChunk(source.id).finally(() => inFlight.delete(p));
  inFlight.add(p);

  return source;
}

async function extractAndChunk(sourceId: string) {
  const source = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!source) return;
  try {
    const buf = await readFile(source.storagePath);
    const { segments } = await extract(buf, source.filename, source.mimeType ?? undefined);
    const chunks = chunkSegments(segments);

    if (chunks.length === 0) {
      await prisma.source.update({
        where: { id: sourceId },
        data: { extractionStatus: "FAILED" },
      });
      return;
    }

    await prisma.sourceChunk.createMany({
      data: chunks.map((c) => ({
        sourceId,
        idx: c.idx,
        text: c.text,
        page: c.page ?? null,
      })),
    });
    await prisma.source.update({
      where: { id: sourceId },
      data: { extractionStatus: "DONE" },
    });
  } catch {
    await prisma.source
      .update({ where: { id: sourceId }, data: { extractionStatus: "FAILED" } })
      .catch(() => {});
  }
}

export async function deleteSource(sourceId: string) {
  const source = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!source) return;
  await deleteFile(source.storagePath).catch(() => {});
  await prisma.source.delete({ where: { id: sourceId } });
}

// Loads extracted chunks for an analysis's sources and returns the most
// relevant to `query` via local BM25.
export async function retrieveForAnalysis(
  analysisId: string,
  query: string,
  topK = 6,
): Promise<ScoredChunk[]> {
  const sources = await prisma.source.findMany({
    where: { analysisId, extractionStatus: "DONE" },
    include: { chunks: true },
  });
  const candidates: RetrievableChunk[] = [];
  for (const s of sources) {
    for (const c of s.chunks) {
      candidates.push({
        id: c.id,
        text: c.text,
        sourceId: s.id,
        filename: s.filename,
        page: c.page ?? undefined,
      });
    }
  }
  return retrieve(candidates, query, topK);
}
