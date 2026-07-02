// LLMService — routes memo-pipeline calls to the enabled LLM provider plugin.
// Resolves the right model for each task tier (reasoning / drafting) from the
// active plugin's own catalog (with optional Settings overrides), and exposes
// pricing so the pipeline can account cost per call.
import "server-only";
import { prisma } from "@/lib/db";
import { ensurePluginsRegistered } from "@/lib/plugins/bootstrap";
import { registry } from "@/lib/plugins/registry";
import { getRuntimeConfig } from "@/lib/provider-config";
import { getSetting } from "@/lib/app-settings";
import type {
  LLMCompletionRequest,
  LLMModelPricing,
  LLMProvider,
  LLMProviderPlugin,
} from "@/lib/plugins/types";

export type ModelTier = "reasoning" | "drafting";

export class LLMService {
  private constructor(
    private provider: LLMProvider,
    private plugin: LLMProviderPlugin,
    readonly providerKey: string,
    private overrides: { reasoningModel: string; draftingModel: string },
  ) {}

  // Builds from the highest-priority enabled LLM plugin. Returns null if none
  // is enabled/configured, so callers can fail with clear guidance.
  static async create(): Promise<LLMService | null> {
    ensurePluginsRegistered();
    const cfg = await prisma.providerConfig.findFirst({
      where: { kind: "LLM", enabled: true },
      orderBy: { priority: "asc" },
    });
    if (!cfg) return null;
    const plugin = registry.getLLMPlugin(cfg.providerKey);
    if (!plugin) return null;
    const runtime = await getRuntimeConfig(cfg.providerKey);
    const prefs = await getSetting("modelPreferences");
    return new LLMService(plugin.create(runtime), plugin, cfg.providerKey, {
      reasoningModel: prefs.reasoningModel,
      draftingModel: prefs.draftingModel,
    });
  }

  modelFor(tier: ModelTier): string {
    const override =
      tier === "reasoning"
        ? this.overrides.reasoningModel
        : this.overrides.draftingModel;
    if (override) return override;
    const exact = this.plugin.manifest.models.find((m) => m.tier === tier);
    return exact?.id ?? this.plugin.manifest.models[0]?.id ?? "";
  }

  pricingFor(modelId: string): LLMModelPricing | null {
    return (
      this.plugin.manifest.models.find((m) => m.id === modelId)?.pricing ?? null
    );
  }

  /** USD cost for a call, from the plugin's pricing table. Null if unknown. */
  costUsd(modelId: string, inTok: number, outTok: number): number | null {
    const p = this.pricingFor(modelId);
    if (!p) return null;
    return (inTok * p.usdPerMTokIn + outTok * p.usdPerMTokOut) / 1_000_000;
  }

  async complete(req: Omit<LLMCompletionRequest, "model">, tier: ModelTier) {
    return this.provider.complete({ ...req, model: this.modelFor(tier) });
  }
}
