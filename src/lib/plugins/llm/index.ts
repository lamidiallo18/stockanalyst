// LLM-provider plugin discovery.
// To add a provider (e.g. OpenAI): create a plugin file here and add one
// import + register line below.

import { registry } from "../registry";
import { anthropicPlugin } from "./anthropic";

let registered = false;

export function registerLLMPlugins() {
  if (registered) return;
  registry.registerLLM(anthropicPlugin);
  registered = true;
}
