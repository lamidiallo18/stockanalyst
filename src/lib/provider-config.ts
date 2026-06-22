// Bridges the in-memory plugin registry with persisted, encrypted config in
// the DB. This is the single place that handles secret encryption/decryption
// so the rest of the app never touches plaintext keys directly.

import "server-only";
import { prisma } from "@/lib/db";
import { ensurePluginsRegistered } from "@/lib/plugins/bootstrap";
import { registry } from "@/lib/plugins/registry";
import {
  canEncrypt,
  decryptSecret,
  encryptSecret,
  maskSecret,
} from "@/lib/crypto";
import type {
  AnyPlugin,
  PluginConfig,
  PluginConfigField,
} from "@/lib/plugins/types";

// Safe, serializable view of a plugin + its saved config for the UI.
// Secret values are NEVER returned in plaintext — only a masked hint.
export interface PluginView {
  key: string;
  name: string;
  description: string;
  kind: "DATA" | "LLM";
  capabilities?: string[];
  models?: { id: string; label: string; tier: string }[];
  configFields: PluginConfigField[];
  docsUrl?: string;
  keyless?: boolean;
  enabled: boolean;
  priority: number;
  /** non-secret config values + masked hints for secret values */
  configValues: Record<string, string | number | boolean>;
  secretHints: Record<string, string>; // key -> masked hint (if set)
  configured: boolean; // all required fields present
}

function manifestKind(p: AnyPlugin): "DATA" | "LLM" {
  return p.manifest.kind;
}

export async function listPluginViews(): Promise<PluginView[]> {
  ensurePluginsRegistered();
  const plugins = registry.listAll();
  const configs = await prisma.providerConfig.findMany();
  const byKey = new Map(configs.map((c) => [c.providerKey, c]));

  return plugins.map((p): PluginView => {
    const cfg = byKey.get(p.manifest.key);
    const saved: Record<string, unknown> = cfg
      ? JSON.parse(cfg.settingsJson || "{}")
      : {};

    const configValues: Record<string, string | number | boolean> = {};
    const secretHints: Record<string, string> = {};
    let configured = true;

    for (const field of p.manifest.configFields) {
      if (field.secret) {
        // Secret lives in encryptedApiKey (single-secret plugins) or in saved.
        const hasSecret =
          field.key === "apiKey"
            ? Boolean(cfg?.encryptedApiKey)
            : Boolean(saved[field.key]);
        if (hasSecret && cfg?.encryptedApiKey && canEncrypt()) {
          try {
            secretHints[field.key] = maskSecret(
              decryptSecret(cfg.encryptedApiKey),
            );
          } catch {
            secretHints[field.key] = "••••";
          }
        }
        if (field.required && !hasSecret) configured = false;
      } else {
        const v = saved[field.key];
        if (v !== undefined)
          configValues[field.key] = v as string | number | boolean;
        if (field.required && (v === undefined || v === ""))
          configured = false;
      }
    }

    const base = {
      key: p.manifest.key,
      name: p.manifest.name,
      description: p.manifest.description,
      kind: manifestKind(p),
      configFields: p.manifest.configFields,
      docsUrl: p.manifest.docsUrl,
      enabled: cfg?.enabled ?? false,
      priority: cfg?.priority ?? 100,
      configValues,
      secretHints,
      configured,
    };

    if (p.manifest.kind === "DATA") {
      return {
        ...base,
        capabilities: p.manifest.capabilities,
        keyless: p.manifest.keyless,
      };
    }
    return { ...base, models: p.manifest.models };
  });
}

// Saves user-submitted config for a plugin. Secret fields are encrypted;
// empty secret submissions are ignored so existing keys aren't wiped.
export interface SavePluginInput {
  enabled?: boolean;
  priority?: number;
  values?: Record<string, string | number | boolean>;
}

export async function savePluginConfig(
  providerKey: string,
  input: SavePluginInput,
) {
  ensurePluginsRegistered();
  const plugin =
    registry.getDataPlugin(providerKey) ?? registry.getLLMPlugin(providerKey);
  if (!plugin) throw new Error(`Unknown plugin: ${providerKey}`);

  const existing = await prisma.providerConfig.findUnique({
    where: { providerKey },
  });
  const saved: Record<string, unknown> = existing
    ? JSON.parse(existing.settingsJson || "{}")
    : {};

  let encryptedApiKey = existing?.encryptedApiKey ?? null;

  for (const field of plugin.manifest.configFields) {
    const incoming = input.values?.[field.key];
    if (incoming === undefined) continue;
    if (field.secret) {
      const str = String(incoming);
      if (str.trim() === "") continue; // don't overwrite with blank
      if (!canEncrypt()) {
        throw new Error(
          "Cannot store secret: APP_SECRET is not set in .env.local.",
        );
      }
      if (field.key === "apiKey") {
        encryptedApiKey = encryptSecret(str);
      } else {
        saved[field.key] = encryptSecret(str);
      }
    } else {
      saved[field.key] = incoming;
    }
  }

  await prisma.providerConfig.upsert({
    where: { providerKey },
    create: {
      providerKey,
      kind: plugin.manifest.kind,
      enabled: input.enabled ?? false,
      priority: input.priority ?? 100,
      encryptedApiKey,
      settingsJson: JSON.stringify(saved),
    },
    update: {
      enabled: input.enabled ?? existing?.enabled ?? false,
      priority: input.priority ?? existing?.priority ?? 100,
      encryptedApiKey,
      settingsJson: JSON.stringify(saved),
    },
  });
}

// Builds the runtime config (with decrypted secrets) for instantiating a
// provider. Server-only; never expose the result to the client.
export async function getRuntimeConfig(
  providerKey: string,
): Promise<PluginConfig> {
  const cfg = await prisma.providerConfig.findUnique({
    where: { providerKey },
  });
  const out: PluginConfig = {};
  if (!cfg) return out;
  const saved: Record<string, unknown> = JSON.parse(cfg.settingsJson || "{}");
  for (const [k, v] of Object.entries(saved)) {
    out[k] = v as string | number | boolean;
  }
  if (cfg.encryptedApiKey && canEncrypt()) {
    try {
      out.apiKey = decryptSecret(cfg.encryptedApiKey);
    } catch {
      /* leave unset if decryption fails */
    }
  }
  return out;
}
