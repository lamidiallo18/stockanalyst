// Content-addressed local file storage for uploaded sources. Files live under
// ./data/uploads/<sha256>.<ext>; identical content dedupes to the same path.
// Nothing is ever sent off the machine here.
import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

export function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function extFor(filename: string, mime?: string): string {
  const e = path.extname(filename).replace(".", "").toLowerCase();
  if (e) return e;
  if (mime?.includes("pdf")) return "pdf";
  if (mime?.includes("word")) return "docx";
  if (mime?.startsWith("image/")) return mime.split("/")[1] ?? "png";
  return "bin";
}

export interface StoredFile {
  storagePath: string; // absolute
  sha256: string;
  byteSize: number;
}

export async function storeFile(
  buf: Buffer,
  filename: string,
  mime?: string,
): Promise<StoredFile> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const hash = sha256(buf);
  const storagePath = path.join(UPLOAD_DIR, `${hash}.${extFor(filename, mime)}`);
  // Only write if not already present (content-addressed dedupe).
  try {
    await fs.access(storagePath);
  } catch {
    await fs.writeFile(storagePath, buf);
  }
  return { storagePath, sha256: hash, byteSize: buf.length };
}

export async function readFile(storagePath: string): Promise<Buffer> {
  return fs.readFile(storagePath);
}

export async function deleteFile(storagePath: string): Promise<void> {
  await fs.rm(storagePath, { force: true });
}
