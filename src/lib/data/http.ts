// Cache-through HTTP/JSON helper for data providers.
//
// Every external GET goes through here so responses are (a) timed out, (b)
// cached in the DataCache table with a per-endpoint TTL to conserve API quota
// and make memos reproducible, and (c) consistently error-handled. A manual
// refresh can bypass the cache via `force`.
import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";

export class ProviderHttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

function hashParams(url: string, headers?: Record<string, string>): string {
  return crypto
    .createHash("sha256")
    .update(url + JSON.stringify(headers ?? {}))
    .digest("hex")
    .slice(0, 32);
}

export interface CachedFetchOpts {
  providerKey: string;
  endpoint: string; // logical name, e.g. "profile"
  url: string;
  headers?: Record<string, string>;
  ttlSeconds?: number;
  timeoutMs?: number;
  force?: boolean; // bypass cache read
}

export async function cachedFetchJson<T>(opts: CachedFetchOpts): Promise<T> {
  const {
    providerKey,
    endpoint,
    url,
    headers,
    ttlSeconds = 3600,
    timeoutMs = 15_000,
    force = false,
  } = opts;
  const paramsHash = hashParams(url, headers);

  if (!force) {
    const hit = await prisma.dataCache.findUnique({
      where: {
        providerKey_endpoint_paramsHash: { providerKey, endpoint, paramsHash },
      },
    });
    if (hit) {
      const ageSec = (Date.now() - hit.fetchedAt.getTime()) / 1000;
      if (ageSec < hit.ttlSeconds) {
        return JSON.parse(hit.responseJson) as T;
      }
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { accept: "application/json", ...headers },
      signal: controller.signal,
    });
  } catch (e) {
    throw new ProviderHttpError(
      `Network error calling ${providerKey}/${endpoint}: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new ProviderHttpError(
      `${providerKey}/${endpoint} returned HTTP ${res.status}`,
      res.status,
    );
  }

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ProviderHttpError(
      `${providerKey}/${endpoint} returned non-JSON response`,
    );
  }

  await prisma.dataCache.upsert({
    where: {
      providerKey_endpoint_paramsHash: { providerKey, endpoint, paramsHash },
    },
    create: {
      providerKey,
      endpoint,
      paramsHash,
      responseJson: text,
      ttlSeconds,
    },
    update: { responseJson: text, ttlSeconds, fetchedAt: new Date() },
  });

  return data as T;
}
