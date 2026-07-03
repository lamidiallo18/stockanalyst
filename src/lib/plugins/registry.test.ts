import { describe, it, expect } from "vitest";
import { registry } from "./registry";
import type { DataProviderPlugin, LLMProviderPlugin } from "./types";

// Minimal fakes — the registry only reads manifest.key, and importing the real
// plugins would pull in server-only modules. Unique keys avoid colliding with
// anything registered by other test files sharing the singleton.
const fakeData = {
  manifest: { key: "fake-data-regtest", kind: "DATA", capabilities: [], configFields: [] },
} as unknown as DataProviderPlugin;

const fakeLLM = {
  manifest: { key: "fake-llm-regtest", kind: "LLM", configFields: [], models: [] },
} as unknown as LLMProviderPlugin;

describe("plugin registry — idempotent registration (hot-reload safety)", () => {
  it("re-registering the same data plugin key is a no-op, not a throw", () => {
    registry.registerData(fakeData);
    const count = registry.listDataPlugins().length;
    // Simulate the dev hot-reload case: module guard reset, register again.
    expect(() => registry.registerData(fakeData)).not.toThrow();
    expect(registry.listDataPlugins().length).toBe(count);
    expect(registry.getDataPlugin("fake-data-regtest")).toBeDefined();
  });

  it("re-registering the same LLM plugin key is a no-op, not a throw", () => {
    registry.registerLLM(fakeLLM);
    const count = registry.listLLMPlugins().length;
    expect(() => registry.registerLLM(fakeLLM)).not.toThrow();
    expect(registry.listLLMPlugins().length).toBe(count);
    expect(registry.getLLMPlugin("fake-llm-regtest")).toBeDefined();
  });
});
