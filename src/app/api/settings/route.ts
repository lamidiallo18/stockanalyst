// GET  /api/settings  -> all app settings (portfolio limits, model prefs, flags)
// POST /api/settings  -> { key, value } partial update
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getAllSettings,
  setSetting,
  SETTING_DEFAULTS,
  type SettingKey,
} from "@/lib/app-settings";

export async function GET() {
  return NextResponse.json({ settings: await getAllSettings() });
}

const schema = z.object({
  key: z.enum(Object.keys(SETTING_DEFAULTS) as [SettingKey, ...SettingKey[]]),
  value: z.record(z.string(), z.unknown()),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await setSetting(parsed.data.key, parsed.data.value as any);
  return NextResponse.json({ ok: true, settings: await getAllSettings() });
}
