// GET  /api/plugins -> list all plugins with (safe) config state
// POST /api/plugins -> save config for one plugin { providerKey, ... }
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listPluginViews, savePluginConfig } from "@/lib/provider-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const plugins = await listPluginViews();
  return NextResponse.json({ plugins });
}

const saveSchema = z.object({
  providerKey: z.string().min(1),
  enabled: z.boolean().optional(),
  priority: z.number().int().optional(),
  values: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const { providerKey, ...rest } = parsed.data;
    await savePluginConfig(providerKey, rest);
    const plugins = await listPluginViews();
    return NextResponse.json({ ok: true, plugins });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Save failed" },
      { status: 500 },
    );
  }
}
