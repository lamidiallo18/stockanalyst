// OpenAI LLM plugin — live implementation via the Chat Completions REST API
// (no SDK dependency). Drop-in alternative to the Anthropic plugin.

import {
  type LLMProvider,
  type LLMProviderPlugin,
  type PluginConfig,
} from "../types";

const API = "https://api.openai.com/v1/chat/completions";

interface OpenAIResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

function createOpenAIProvider(config: PluginConfig): LLMProvider {
  const apiKey = String(config.apiKey ?? "");
  const defaultModel = String(config.defaultModel ?? "gpt-4o");

  return {
    key: "openai",
    async complete(req) {
      if (!apiKey) throw new Error("OpenAI API key not configured.");
      const model = req.model ?? defaultModel;
      const messages = [
        ...(req.system ? [{ role: "system", content: req.system }] : []),
        ...req.messages.map((m) => ({ role: m.role, content: m.content })),
      ];
      const res = await fetch(API, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          max_completion_tokens: req.maxTokens ?? 4096,
          temperature: req.temperature ?? 0.3,
        }),
      });
      const json = (await res.json()) as OpenAIResponse;
      if (!res.ok) {
        throw new Error(
          `OpenAI HTTP ${res.status}: ${json.error?.message ?? "request failed"}`,
        );
      }
      return {
        text: json.choices?.[0]?.message?.content ?? "",
        model,
        inputTokens: json.usage?.prompt_tokens,
        outputTokens: json.usage?.completion_tokens,
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
        return { ok: false, message: e instanceof Error ? e.message : "Failed" };
      }
    },
  };
}

export const openaiPlugin: LLMProviderPlugin = {
  manifest: {
    key: "openai",
    name: "OpenAI",
    description:
      "GPT models as an alternative reasoning engine for memo generation. Swappable with Anthropic via the plugin system.",
    kind: "LLM",
    configFields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "secret",
        secret: true,
        required: true,
        placeholder: "sk-...",
        help: "Stored encrypted at rest. Never sent to the browser.",
      },
    ],
    models: [
      { id: "gpt-4o", label: "GPT-4o", tier: "reasoning" },
      { id: "gpt-4o-mini", label: "GPT-4o mini", tier: "drafting" },
    ],
    docsUrl: "https://platform.openai.com/docs",
  },
  create: createOpenAIProvider,
};
