"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardTitle,
  Badge,
  Button,
  Input,
  Muted,
} from "@/components/ui/primitives";

interface PluginConfigField {
  key: string;
  label: string;
  type: "string" | "secret" | "number" | "boolean";
  required: boolean;
  secret?: boolean;
  placeholder?: string;
  help?: string;
}

interface PluginView {
  key: string;
  name: string;
  description: string;
  kind: "DATA" | "LLM";
  capabilities?: string[];
  models?: {
    id: string;
    label: string;
    tier: string;
    pricing: { usdPerMTokIn: number; usdPerMTokOut: number };
  }[];
  configFields: PluginConfigField[];
  docsUrl?: string;
  keyless?: boolean;
  enabled: boolean;
  priority: number;
  configValues: Record<string, string | number | boolean>;
  secretHints: Record<string, string>;
  configured: boolean;
}

interface Settings {
  valuationPolicy: { discountRatePct: number };
  sizingPolicy: { maxSingleNamePct: number; targetVolPct: number };
}

export function SettingsClient({
  encryptionReady,
}: {
  encryptionReady: boolean;
}) {
  const [plugins, setPlugins] = useState<PluginView[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [pRes, sRes] = await Promise.all([
        fetch("/api/plugins"),
        fetch("/api/settings"),
      ]);
      setPlugins((await pRes.json()).plugins);
      setSettings((await sRes.json()).settings);
    } catch {
      setError("Failed to load settings.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="text-[var(--negative)]">{error}</p>;
  if (!plugins || !settings) return <Muted>Loading…</Muted>;

  const data = plugins.filter((p) => p.kind === "DATA");
  const llm = plugins.filter((p) => p.kind === "LLM");

  return (
    <div className="space-y-8">
      {!encryptionReady && (
        <Card className="border-[var(--warning)]/40">
          <CardTitle className="text-[var(--warning)]">
            APP_SECRET not set
          </CardTitle>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Add a strong <code>APP_SECRET</code> (≥16 chars) to{" "}
            <code>.env.local</code> and restart. API keys cannot be saved
            securely until this is set. See <code>.env.example</code>.
          </p>
        </Card>
      )}

      <AssumptionsCard settings={settings} onSaved={load} />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Data Provider Plugins
        </h2>
        <div className="space-y-4">
          {data.map((p) => (
            <PluginCard key={p.key} plugin={p} onSaved={load} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          LLM Provider Plugins
        </h2>
        <div className="space-y-4">
          {llm.map((p) => (
            <PluginCard key={p.key} plugin={p} onSaved={load} />
          ))}
        </div>
      </section>
    </div>
  );
}

function AssumptionsCard({
  settings,
  onSaved,
}: {
  settings: Settings;
  onSaved: () => void;
}) {
  const [discount, setDiscount] = useState(
    String(settings.valuationPolicy.discountRatePct),
  );
  const [cap, setCap] = useState(String(settings.sizingPolicy.maxSingleNamePct));
  const [targetVol, setTargetVol] = useState(
    String(settings.sizingPolicy.targetVolPct),
  );
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setMsg(null);
    const r1 = await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        key: "valuationPolicy",
        value: { discountRatePct: Number(discount) || 10 },
      }),
    });
    const r2 = await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        key: "sizingPolicy",
        value: {
          maxSingleNamePct: Number(cap) || 8,
          targetVolPct: Number(targetVol) || 25,
        },
      }),
    });
    setMsg(r1.ok && r2.ok ? "Saved." : "Save failed.");
    onSaved();
  }

  return (
    <Card>
      <CardTitle>Analysis Assumptions</CardTitle>
      <Muted className="mt-1 block text-xs">
        Reverse-DCF horizon is pinned at 10y with a 2.5% perpetuity terminal
        growth (documented constants). Discount rate and sizing inputs are
        yours to set.
      </Muted>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs text-[var(--muted)]">
            Discount rate % (reverse DCF)
          </label>
          <Input
            type="number"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--muted)]">
            Max single-name % (sizing cap)
          </label>
          <Input type="number" value={cap} onChange={(e) => setCap(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--muted)]">
            Target volatility % (sizing)
          </label>
          <Input
            type="number"
            value={targetVol}
            onChange={(e) => setTargetVol(e.target.value)}
          />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-3">
        {msg && <Muted className="text-xs">{msg}</Muted>}
        <Button onClick={save}>Save assumptions</Button>
      </div>
    </Card>
  );
}

function PluginCard({
  plugin,
  onSaved,
}: {
  plugin: PluginView;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState(plugin.enabled);
  const [priority, setPriority] = useState(plugin.priority);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function setField(key: string, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/plugins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerKey: plugin.key,
          enabled,
          priority,
          values,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg(json.error ?? "Save failed");
      } else {
        setMsg("Saved.");
        setValues({});
        onSaved();
      }
    } catch {
      setMsg("Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CardTitle>{plugin.name}</CardTitle>
          {plugin.keyless && <Badge tone="accent">keyless</Badge>}
          {plugin.configured ? (
            <Badge tone="positive">configured</Badge>
          ) : (
            <Badge tone="warning">needs config</Badge>
          )}
          {plugin.enabled ? (
            <Badge tone="positive">enabled</Badge>
          ) : (
            <Badge>disabled</Badge>
          )}
        </div>
        <code className="text-xs text-[var(--muted)]">{plugin.key}</code>
      </div>

      <p className="mt-2 text-sm text-[var(--muted)]">{plugin.description}</p>

      {plugin.capabilities && (
        <div className="mt-2 flex flex-wrap gap-1">
          {plugin.capabilities.map((c) => (
            <Badge key={c}>{c}</Badge>
          ))}
        </div>
      )}
      {plugin.models && (
        <div className="mt-2 flex flex-wrap gap-1">
          {plugin.models.map((m, i) => (
            <Badge key={`${m.id}-${i}`} tone="accent">
              {m.label} · {m.tier} · ${m.pricing.usdPerMTokIn}/$
              {m.pricing.usdPerMTokOut} per MTok
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {plugin.configFields.map((f) => {
          const hint = plugin.secretHints[f.key];
          const savedVal = plugin.configValues[f.key];
          return (
            <div key={f.key}>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
                {f.label}
                {f.required && <span className="text-[var(--negative)]"> *</span>}
              </label>
              <Input
                type={f.secret ? "password" : "text"}
                placeholder={
                  f.secret && hint
                    ? `saved (${hint}) — leave blank to keep`
                    : f.placeholder
                }
                defaultValue={
                  !f.secret && savedVal !== undefined ? String(savedVal) : ""
                }
                onChange={(e) => setField(f.key, e.target.value)}
              />
              {f.help && (
                <p className="mt-1 text-[11px] text-[var(--muted)]">{f.help}</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Enabled
        </label>
        <label className="flex items-center gap-2 text-sm">
          Priority
          <Input
            type="number"
            className="w-20"
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
          />
          <Muted className="text-xs">lower = tried first</Muted>
        </label>
        <div className="ml-auto flex items-center gap-3">
          {msg && <span className="text-xs text-[var(--muted)]">{msg}</span>}
          {plugin.docsUrl && (
            <a
              href={plugin.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-[var(--accent)]"
            >
              docs ↗
            </a>
          )}
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
