// Financial Modeling Prep data plugin.
// Phase 0: manifest + config schema are complete so the Settings UI and
// registry work end-to-end. Live endpoint calls are implemented in Phase 1.

import {
  DataCapability,
  NOT_SUPPORTED,
  type DataProvider,
  type DataProviderPlugin,
  type PluginConfig,
} from "../types";

const NOT_YET = "FMP live calls are implemented in Phase 1 (data spine).";

function createFmpProvider(config: PluginConfig): DataProvider {
  const apiKey = String(config.apiKey ?? "");
  return {
    key: "fmp",
    async getProfile() {
      return NOT_SUPPORTED;
    },
    async getQuote() {
      return NOT_SUPPORTED;
    },
    async getFinancials() {
      return NOT_SUPPORTED;
    },
    async getPeers() {
      return NOT_SUPPORTED;
    },
    async getNews() {
      return NOT_SUPPORTED;
    },
    async getFilings() {
      return NOT_SUPPORTED;
    },
    async search() {
      return NOT_SUPPORTED;
    },
    async healthCheck() {
      if (!apiKey) return { ok: false, message: "No API key configured." };
      return { ok: false, message: NOT_YET };
    },
  };
}

export const fmpPlugin: DataProviderPlugin = {
  manifest: {
    key: "fmp",
    name: "Financial Modeling Prep",
    description:
      "Broad fundamentals, ratios, peers, estimates and news. Primary data provider for v1.",
    kind: "DATA",
    capabilities: [
      DataCapability.PROFILE,
      DataCapability.QUOTE,
      DataCapability.FINANCIALS,
      DataCapability.PEERS,
      DataCapability.ESTIMATES,
      DataCapability.NEWS,
      DataCapability.SEARCH,
    ],
    configFields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "secret",
        secret: true,
        required: true,
        placeholder: "FMP API key",
        help: "Stored encrypted at rest. Get one at financialmodelingprep.com.",
      },
    ],
    docsUrl: "https://site.financialmodelingprep.com/developer/docs",
  },
  create: createFmpProvider,
};
