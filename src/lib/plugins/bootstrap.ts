// Ensures all plugins are registered exactly once before the registry is read.
// Call this at the top of any server code that touches the registry.
//
// The guard lives on globalThis so it shares the lifetime of the registry
// singleton (which also lives there). If both are reset together on a real
// restart, registration re-runs; if both survive a dev hot-reload, it doesn't.
// Registration is idempotent regardless (see registry.ts), so this is a
// performance guard, not a correctness one.
import { registerDataPlugins } from "./data";
import { registerLLMPlugins } from "./llm";

const g = globalThis as unknown as { __pluginsBootstrapped?: boolean };

export function ensurePluginsRegistered() {
  if (g.__pluginsBootstrapped) return;
  registerDataPlugins();
  registerLLMPlugins();
  g.__pluginsBootstrapped = true;
}
