// SEC EDGAR data plugin — live implementation. Free + keyless (SEC only
// requires a descriptive User-Agent). Authoritative for reported fundamentals
// per docs/normalization-policy.md §1; used to cross-check FMP.

import {
  DataCapability,
  NOT_SUPPORTED,
  type DataProvider,
  type DataProviderPlugin,
  type PluginConfig,
  type ProviderResult,
} from "../types";
import { cachedFetchJson } from "@/lib/data/http";
import * as N from "./edgar.normalize";

const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const DAY = 86_400;

function ok<T>(data: T): ProviderResult<T> {
  return { data, providerKey: "edgar", fetchedAt: new Date().toISOString() };
}

function createEdgarProvider(config: PluginConfig): DataProvider {
  const userAgent = String(config.userAgent ?? "");
  const headers = () => ({ "user-agent": userAgent });

  async function tickerMap(): Promise<N.EdgarTickerMap> {
    return cachedFetchJson<N.EdgarTickerMap>({
      providerKey: "edgar",
      endpoint: "tickers",
      url: TICKERS_URL,
      headers: headers(),
      ttlSeconds: 7 * DAY,
    });
  }

  async function resolveCik(ticker: string): Promise<string | null> {
    const map = N.normalizeTickerMap(await tickerMap());
    return map.get(ticker.toUpperCase())?.cik ?? null;
  }

  return {
    key: "edgar",

    async getProfile(ticker) {
      if (!userAgent) return NOT_SUPPORTED;
      const cik = await resolveCik(ticker);
      if (!cik) return NOT_SUPPORTED;
      const s = await cachedFetchJson<N.EdgarSubmissions>({
        providerKey: "edgar",
        endpoint: "submissions",
        url: `https://data.sec.gov/submissions/CIK${cik}.json`,
        headers: headers(),
        ttlSeconds: DAY,
      });
      return ok(N.normalizeSubmissionsProfile(ticker, s));
    },

    async getQuote() {
      return NOT_SUPPORTED; // EDGAR has no market data
    },

    async getFinancials(ticker) {
      if (!userAgent) return NOT_SUPPORTED;
      const cik = await resolveCik(ticker);
      if (!cik) return NOT_SUPPORTED;
      const cf = await cachedFetchJson<N.EdgarCompanyFacts>({
        providerKey: "edgar",
        endpoint: "companyfacts",
        url: `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
        headers: headers(),
        ttlSeconds: DAY,
      });
      return ok(N.normalizeCompanyFacts(ticker, cf));
    },

    async getHistoricalRatios() {
      return NOT_SUPPORTED; // no market data → no multiples
    },

    async getPriceHistory() {
      return NOT_SUPPORTED;
    },

    async getPeers() {
      return NOT_SUPPORTED;
    },

    async search(query) {
      if (!userAgent) return NOT_SUPPORTED;
      const map = await tickerMap();
      return ok(N.searchTickerMap(map, query));
    },

    async healthCheck() {
      if (!userAgent)
        return {
          ok: false,
          message: "SEC requires a User-Agent (e.g. 'Name email@example.com').",
        };
      try {
        await tickerMap();
        return { ok: true };
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : "Failed" };
      }
    },
  };
}

export const edgarPlugin: DataProviderPlugin = {
  manifest: {
    key: "edgar",
    name: "SEC EDGAR",
    description:
      "Authoritative XBRL fundamentals from filings. Free, keyless. Overrides FMP on >2% disagreement for reported fundamentals (docs/normalization-policy.md).",
    kind: "DATA",
    keyless: true,
    capabilities: [
      DataCapability.PROFILE,
      DataCapability.FINANCIALS,
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
