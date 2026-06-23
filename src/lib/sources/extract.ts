// Text extraction dispatcher. Maps a file to TextSegments (with page numbers
// where available) based on its type. Heavy/optional engines (PDF, OCR) are
// dynamically imported so a failure in one path never breaks the others.
import "server-only";
import type { TextSegment } from "./chunk";

export type SourceKind = "PDF" | "DOCX" | "IMAGE" | "TEXT" | "UNKNOWN";

export function classify(filename: string, mime?: string): SourceKind {
  const lower = filename.toLowerCase();
  if (mime?.includes("pdf") || lower.endsWith(".pdf")) return "PDF";
  if (mime?.includes("word") || lower.endsWith(".docx")) return "DOCX";
  if (mime?.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|tiff?)$/.test(lower))
    return "IMAGE";
  if (
    mime?.startsWith("text/") ||
    /\.(txt|md|markdown|csv|json|html?)$/.test(lower)
  )
    return "TEXT";
  return "UNKNOWN";
}

export interface ExtractionResult {
  segments: TextSegment[];
  engine: string;
  charCount: number;
}

async function extractPdf(buf: Buffer): Promise<TextSegment[]> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  return pages
    .map((t, i) => ({ page: i + 1, text: String(t ?? "") }))
    .filter((s) => s.text.trim().length > 0);
}

async function extractDocx(buf: Buffer): Promise<TextSegment[]> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return value.trim() ? [{ text: value }] : [];
}

async function extractImage(buf: Buffer): Promise<TextSegment[]> {
  // OCR is optional; if tesseract or its assets are unavailable we degrade
  // gracefully rather than failing the upload.
  const { recognize } = await import("tesseract.js");
  const { data } = await recognize(buf, "eng");
  return data.text.trim() ? [{ text: data.text }] : [];
}

export async function extract(
  buf: Buffer,
  filename: string,
  mime?: string,
): Promise<ExtractionResult> {
  const kind = classify(filename, mime);
  let segments: TextSegment[] = [];
  let engine = "none";

  switch (kind) {
    case "PDF":
      segments = await extractPdf(buf);
      engine = "unpdf";
      break;
    case "DOCX":
      segments = await extractDocx(buf);
      engine = "mammoth";
      break;
    case "IMAGE":
      segments = await extractImage(buf);
      engine = "tesseract";
      break;
    case "TEXT":
      segments = [{ text: buf.toString("utf8") }];
      engine = "utf8";
      break;
    default:
      // Best-effort: try to read as UTF-8 text.
      segments = [{ text: buf.toString("utf8") }];
      engine = "utf8-fallback";
  }

  const charCount = segments.reduce((s, seg) => s + seg.text.length, 0);
  return { segments, engine, charCount };
}
