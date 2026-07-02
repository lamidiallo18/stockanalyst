// Data-provider plugin discovery.
// To add a provider: create a plugin file in this folder and add one import +
// register line below. The registry and Settings UI pick it up automatically.

import { registry } from "../registry";
import { fmpPlugin } from "./fmp";
import { edgarPlugin } from "./edgar";

let registered = false;

export function registerDataPlugins() {
  if (registered) return;
  registry.registerData(fmpPlugin);
  registry.registerData(edgarPlugin);
  registered = true;
}
