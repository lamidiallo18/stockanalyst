// Generic key/value app settings (portfolio limits, model preferences, flags).
import "server-only";
import { prisma } from "@/lib/db";

// Defaults applied when a setting hasn't been saved yet.
export const SETTING_DEFAULTS = {
  portfolioLimits: {
    maxSingleNamePct: 8,
    maxSectorPct: 30,
    maxThemePct: 35,
    targetCashPct: 5,
  },
  modelPreferences: {
    reasoningModel: "claude-opus-4-8",
    draftingModel: "claude-sonnet-4-6",
    extractionModel: "claude-haiku-4-5-20251001",
  },
  features: {
    allowSourceExcerptsToLLM: true,
    useEmbeddingRetrieval: false,
  },
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSetting<K extends SettingKey>(
  key: K,
): Promise<(typeof SETTING_DEFAULTS)[K]> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  if (!row) return SETTING_DEFAULTS[key];
  try {
    return { ...SETTING_DEFAULTS[key], ...JSON.parse(row.valueJson) };
  } catch {
    return SETTING_DEFAULTS[key];
  }
}

export async function setSetting<K extends SettingKey>(
  key: K,
  value: Partial<(typeof SETTING_DEFAULTS)[K]>,
): Promise<void> {
  const merged = { ...(await getSetting(key)), ...value };
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, valueJson: JSON.stringify(merged) },
    update: { valueJson: JSON.stringify(merged) },
  });
}

export async function getAllSettings() {
  const entries = await Promise.all(
    (Object.keys(SETTING_DEFAULTS) as SettingKey[]).map(
      async (k) => [k, await getSetting(k)] as const,
    ),
  );
  return Object.fromEntries(entries) as {
    [K in SettingKey]: (typeof SETTING_DEFAULTS)[K];
  };
}
