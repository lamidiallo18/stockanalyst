// Generic key/value app settings. Every default here is consumed by v1 code:
// valuationPolicy by the reverse-DCF module, sizingPolicy by the sizing engine,
// modelPreferences by the LLM service.
import "server-only";
import { prisma } from "@/lib/db";

export const SETTING_DEFAULTS = {
  // Reverse-DCF inputs (deterministic; see src/lib/calc/reverse-dcf.ts).
  // Horizon is pinned at 10y and terminal assumption is perpetuity growth —
  // both documented constants in the module, not settings.
  valuationPolicy: {
    discountRatePct: 10,
  },
  // Deterministic position-sizing inputs (src/lib/sizing/engine.ts).
  sizingPolicy: {
    maxSingleNamePct: 8,
    targetVolPct: 25,
  },
  modelPreferences: {
    // Tier→model resolution normally comes from the enabled LLM plugin's
    // catalog; these act as overrides when set.
    reasoningModel: "",
    draftingModel: "",
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
