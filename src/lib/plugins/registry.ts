// Plugin registry. Holds the set of discovered data + LLM plugins and exposes
// lookup helpers. Discovery is explicit (each plugin is imported & registered
// in plugins/data/index.ts or plugins/llm/index.ts) which keeps it compatible
// with bundlers while still being "drop a file + one import line" simple.

import type {
  DataProviderPlugin,
  LLMProviderPlugin,
  AnyPlugin,
} from "./types";

class PluginRegistry {
  private data = new Map<string, DataProviderPlugin>();
  private llm = new Map<string, LLMProviderPlugin>();

  registerData(plugin: DataProviderPlugin) {
    if (this.data.has(plugin.manifest.key)) {
      throw new Error(`Duplicate data plugin key: ${plugin.manifest.key}`);
    }
    this.data.set(plugin.manifest.key, plugin);
  }

  registerLLM(plugin: LLMProviderPlugin) {
    if (this.llm.has(plugin.manifest.key)) {
      throw new Error(`Duplicate LLM plugin key: ${plugin.manifest.key}`);
    }
    this.llm.set(plugin.manifest.key, plugin);
  }

  getDataPlugin(key: string): DataProviderPlugin | undefined {
    return this.data.get(key);
  }

  getLLMPlugin(key: string): LLMProviderPlugin | undefined {
    return this.llm.get(key);
  }

  listDataPlugins(): DataProviderPlugin[] {
    return [...this.data.values()];
  }

  listLLMPlugins(): LLMProviderPlugin[] {
    return [...this.llm.values()];
  }

  listAll(): AnyPlugin[] {
    return [...this.data.values(), ...this.llm.values()];
  }
}

// Single shared instance across the app (survives dev HMR).
const globalForRegistry = globalThis as unknown as {
  __pluginRegistry?: PluginRegistry;
};

export const registry =
  globalForRegistry.__pluginRegistry ??
  (globalForRegistry.__pluginRegistry = new PluginRegistry());
