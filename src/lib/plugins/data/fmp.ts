// Financial Modeling Prep data plugin — live implementation.
// Normalization lives in fmp.normalize.ts (pure, unit-tested); this file does
// the I/O and wires normalized results into the provider contract.

import {
  DataCapability,
  NOT_SUPPORTED,
  type DataProvider,
  type DataProviderPlugin,
  type NotSupported,
  type PluginConfig,
  type ProviderResult,
} from "../types";
import { cachedFetchJson } from "@/lib/data/http";
import * as N from "./fmp.normalize";

const BASE = "https://financialmodelingprep.com/api";
const DAY = 86_400;

function ok<T>(data: T): ProviderResult<T> {
  return { data, providerKey: "fmp", fetchedAt: new Date().toISOString() };
}

function createFmpProvider(config: PluginConfig): DataProvider {
  const apiKey = String(config.apiKey ?? "");
  const key = (extra = "") => `apikey=${encodeURIComponent(apiKey)}${extra}`;

  async function get<T>(
    endpoint: string,
    path: string,
    extraQuery = "",
    ttlSeconds = DAY,
  ): Promise<T> {
    const url = `${BASE}/${path}?${key(extraQuery)}`;
    return cachedFetchJson<T>({ providerKey: "fmp", endpoint, url, ttlSeconds });
  }

  function requireKey(): NotSupported | null {
    return apiKey ? null : NOT_SUPPORTED;
  }

  return {
    key: "fmp",

    async getProfile(ticker) {
      if (requireKey()) return NOT_SUPPORTED;
      const raw = await get<N.FmpProfile[]>("profile", `v3/profile/${ticker}`, "", 7 * DAY);
      const norm = N.normalizeProfile(raw);
      return norm ? ok(norm) : NOT_SUPPORTED;
    },

    async getQuote(ticker) {
      if (requireKey()) return NOT_SUPPORTED;
      const raw = await get<N.FmpQuote[]>("quote", `v3/quote/${ticker}`, "", 300);
      const norm = N.normalizeQuote(raw, new Date().toISOString());
      return norm ? ok(norm) : NOT_SUPPORTED;
    },

    async getFinancials(ticker, opts) {
      if (requireKey()) return NOT_SUPPORTED;
      const limit = opts?.years ?? 6;
      const period = opts?.quarterly ? "&period=quarter" : "";
      const [income, balance, cashflow] = await Promise.all([
        get<N.FmpIncome[]>("income", `v3/income-statement/${ticker}`, `&limit=${limit}${period}`),
        get<N.FmpBalance[]>("balance", `v3/balance-sheet-statement/${ticker}`, `&limit=${limit}${period}`),
        get<N.FmpCashflow[]>("cashflow", `v3/cash-flow-statement/${ticker}`, `&limit=${limit}${period}`),
      ]);
      return ok(N.normalizeFinancials(ticker, income, balance, cashflow));
    },

    async getHistoricalRatios(ticker, opts) {
      if (requireKey()) return NOT_SUPPORTED;
      const limit = opts?.years ?? 8;
      const raw = await get<N.FmpRatio[]>("ratios", `v3/ratios/${ticker}`, `&limit=${limit}`);
      return ok(N.normalizeRatios(raw));
    },

    async getPeers(ticker) {
      if (requireKey()) return NOT_SUPPORTED;
      const raw = await get<N.FmpPeers[]>("peers", `v4/stock_peers`, `&symbol=${ticker}`, 7 * DAY);
      return ok(N.normalizePeers(raw));
    },

    async getNews(query) {
      if (requireKey()) return NOT_SUPPORTED;
      const raw = await get<N.FmpNews[]>("news", `v3/stock_news`, `&tickers=${encodeURIComponent(query)}&limit=30`, 3600);
      return ok(N.normalizeNews(raw));
    },

    async getFilings() {
      return NOT_SUPPORTED; // EDGAR is authoritative for filings
    },

    async search(query) {
      if (requireKey()) return NOT_SUPPORTED;
      const raw = await get<N.FmpSearch[]>("search", `v3/search`, `&query=${encodeURIComponent(query)}&limit=10`, DAY);
      return ok(N.normalizeSearch(raw));
    },

    async healthCheck() {
      if (!apiKey) return { ok: false, message: "No API key configured." };
      try {
        await get<N.FmpProfile[]>("profile", `v3/profile/AAPL`, "", 0);
        return { ok: true };
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : "Failed" };
      }
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
      DataCapability.HISTORICAL_RATIOS,
      DataCapability.PEERS,
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
