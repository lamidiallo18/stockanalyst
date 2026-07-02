// LLM-provider plugin discovery.
// To add a provider: create a plugin file here and add one import + register
// line below.

import { registry } from "../registry";
import { anthropicPlugin } from "./anthropic";
import { openaiPlugin } from "./openai";

let registered = false;

export function registerLLMPlugins() {
  if (registered) return;
  registry.registerLLM(anthropicPlugin);
  registry.registerLLM(openaiPlugin);
  registered = true;
}
