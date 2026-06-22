// SEC EDGAR data plugin — free, authoritative US filings + XBRL fundamentals.
// Keyless (SEC only requires a descriptive User-Agent). Used as a cross-check
// and fallback against paid providers. Live calls land in Phase 1.

import {
  DataCapability,
  NOT_SUPPORTED,
  type DataProvider,
  type DataProviderPlugin,
  type PluginConfig,
} from "../types";

const NOT_YET = "EDGAR live calls are implemented in Phase 1 (data spine).";

function createEdgarProvider(config: PluginConfig): DataProvider {
  const userAgent = String(config.userAgent ?? "");
  return {
    key: "edgar",
    async getProfile() {
      return NOT_SUPPORTED;
    },
    async getQuote() {
      return NOT_SUPPORTED; // EDGAR has no market quotes
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
      if (!userAgent)
        return {
          ok: false,
          message:
            "SEC requires a User-Agent (e.g. 'Name email@example.com'). Set one in config.",
        };
      return { ok: false, message: NOT_YET };
    },
  };
}

export const edgarPlugin: DataProviderPlugin = {
  manifest: {
    key: "edgar",
    name: "SEC EDGAR",
    description:
      "Authoritative US filings (10-K/10-Q/8-K) and XBRL fundamentals. Free, keyless, used to cross-check paid providers.",
    kind: "DATA",
    keyless: true,
    capabilities: [
      DataCapability.PROFILE,
      DataCapability.FINANCIALS,
      DataCapability.FILINGS,
      DataCapability.SEARCH,
    ],
    configFields: [
      {
        key: "userAgent",
        label: "User-Agent",
        type: "string",
        required: true,
        placeholder: "Your Name your-email@example.com",
        help: "SEC requires a descriptive User-Agent header on all requests.",
      },
    ],
    docsUrl: "https://www.sec.gov/edgar/sec-api-documentation",
  },
  create: createEdgarProvider,
};
