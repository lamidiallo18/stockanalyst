// Ensures all plugins are registered exactly once before the registry is read.
// Call this at the top of any server code that touches the registry.

import { registerDataPlugins } from "./data";
import { registerLLMPlugins } from "./llm";

let done = false;

export function ensurePluginsRegistered() {
  if (done) return;
  registerDataPlugins();
  registerLLMPlugins();
  done = true;
}
