// Anthropic (Claude) LLM plugin — live implementation via the Messages REST
// API (no SDK dependency). Powers thesis critique, bear-case and drafting.
// Pricing per model feeds the pre-run cost estimate and post-run actuals.

import {
  type LLMProvider,
  type LLMProviderPlugin,
  type PluginConfig,
} from "../types";

const API = "https://api.anthropic.com/v1/messages";
const VERSION = "2023-06-01";

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

function createAnthropicProvider(config: PluginConfig): LLMProvider {
  const apiKey = String(config.apiKey ?? "");

  return {
    key: "anthropic",
    async complete(req) {
      if (!apiKey) throw new Error("Anthropic API key not configured.");
      const model = req.model ?? "claude-opus-4-8";
      const res = await fetch(API, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": VERSION,
        },
        body: JSON.stringify({
          model,
          max_tokens: req.maxTokens ?? 4096,
          system: req.system,
          messages: req.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });
      const json = (await res.json()) as AnthropicResponse;
      if (!res.ok) {
        throw new Error(
          `Anthropic HTTP ${res.status}: ${json.error?.message ?? "request failed"}`,
        );
      }
      const text = (json.content ?? [])
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("");
      return {
        text,
        model,
        inputTokens: json.usage?.input_tokens,
        outputTokens: json.usage?.output_tokens,
      };
    },
    async healthCheck() {
      if (!apiKey) return { ok: false, message: "No API key configured." };
      try {
        await this.complete({
          messages: [{ role: "user", content: "ping" }],
          maxTokens: 8,
        });
        return { ok: true };
      } catch (e) {
        return {
          ok: false,
          message: e instanceof Error ? e.message : "Failed",
        };
      }
    },
  };
}

export const anthropicPlugin: LLMProviderPlugin = {
  manifest: {
    key: "anthropic",
    name: "Anthropic (Claude)",
    description:
      "Claude models power thesis critique, bear-case generation and memo drafting. Opus for adversarial reasoning, Sonnet for drafting.",
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
      {
        id: "claude-opus-4-8",
        label: "Claude Opus 4.8",
        tier: "reasoning",
        pricing: { usdPerMTokIn: 5, usdPerMTokOut: 25 },
      },
      {
        id: "claude-sonnet-4-6",
        label: "Claude Sonnet 4.6",
        tier: "drafting",
        pricing: { usdPerMTokIn: 3, usdPerMTokOut: 15 },
      },
    ],
    docsUrl: "https://platform.claude.com/docs",
  },
  create: createAnthropicProvider,
};
