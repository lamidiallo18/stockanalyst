// Anthropic (Claude) LLM plugin. Primary reasoning engine for memo generation.
// Phase 0: manifest + model catalog complete; live SDK calls land in Phase 2.

import {
  type LLMProvider,
  type LLMProviderPlugin,
  type PluginConfig,
} from "../types";

const NOT_YET = "Anthropic live calls are implemented in Phase 2 (memo pipeline).";

function createAnthropicProvider(config: PluginConfig): LLMProvider {
  const apiKey = String(config.apiKey ?? "");
  return {
    key: "anthropic",
    async complete() {
      throw new Error(NOT_YET);
    },
    async healthCheck() {
      if (!apiKey) return { ok: false, message: "No API key configured." };
      return { ok: false, message: NOT_YET };
    },
  };
}

export const anthropicPlugin: LLMProviderPlugin = {
  manifest: {
    key: "anthropic",
    name: "Anthropic (Claude)",
    description:
      "Claude models power thesis critique, bear-case generation and memo drafting. Opus for adversarial reasoning, Sonnet for drafting/extraction.",
    kind: "LLM",
    configFields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "secret",
        secret: true,
        required: true,
        placeholder: "sk-ant-...",
        help: "Stored encrypted at rest. Never sent to the browser.",
      },
    ],
    models: [
      { id: "claude-opus-4-8", label: "Claude Opus 4.8", tier: "reasoning" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", tier: "drafting" },
      {
        id: "claude-haiku-4-5-20251001",
        label: "Claude Haiku 4.5",
        tier: "extraction",
      },
    ],
    docsUrl: "https://docs.anthropic.com",
  },
  create: createAnthropicProvider,
};
