// LLMService — routes memo-pipeline calls to the enabled LLM provider plugin.
// Resolves the right model for each task tier (reasoning / drafting /
// extraction) from the active plugin's own model catalog, so switching
// providers automatically uses sensible model choices.
import "server-only";
import { prisma } from "@/lib/db";
import { ensurePluginsRegistered } from "@/lib/plugins/bootstrap";
import { registry } from "@/lib/plugins/registry";
import { getRuntimeConfig } from "@/lib/provider-config";
import type {
  LLMCompletionRequest,
  LLMProvider,
  LLMProviderPlugin,
} from "@/lib/plugins/types";

export type ModelTier = "reasoning" | "drafting" | "extraction";

export class LLMService {
  private constructor(
    private provider: LLMProvider,
    private plugin: LLMProviderPlugin,
    readonly providerKey: string,
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
    return new LLMService(plugin.create(runtime), plugin, cfg.providerKey);
  }

  modelFor(tier: ModelTier): string | undefined {
    const exact = this.plugin.manifest.models.find((m) => m.tier === tier);
    if (exact) return exact.id;
    // Fall back: reasoning -> any, drafting -> reasoning, extraction -> drafting
    return this.plugin.manifest.models[0]?.id;
  }

  async complete(
    req: Omit<LLMCompletionRequest, "model">,
    tier: ModelTier,
  ) {
    return this.provider.complete({ ...req, model: this.modelFor(tier) });
  }
}
