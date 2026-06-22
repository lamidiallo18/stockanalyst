// ===========================================================================
// Plugin contracts for swappable data + LLM providers.
//
// A "plugin" is a self-contained module that exports a manifest describing
// itself (key, capabilities, config fields) plus a factory that builds a live
// provider instance from a config object. Core code only ever talks to the
// normalized interfaces below — never to a provider's raw API shape.
//
// To add a new provider: create a file under plugins/data/ or plugins/llm/,
// export a `*Plugin` object implementing the contract, and register it in the
// matching index.ts. No changes to the pipeline, registry, or UI are required —
// the Settings page discovers it automatically from the registry.
// ===========================================================================

import type { ReliabilityFlag } from "@/lib/enums";

// ---------------------------------------------------------------------------
// Config schema — how a plugin declares what it needs (API keys, options).
// The Settings UI renders these fields generically.
// ---------------------------------------------------------------------------
export type PluginConfigFieldType = "string" | "secret" | "number" | "boolean";

export interface PluginConfigField {
  key: string;
  label: string;
  type: PluginConfigFieldType;
  required: boolean;
  /** secret fields are encrypted at rest and shown masked. */
  secret?: boolean;
  placeholder?: string;
  help?: string;
  defaultValue?: string | number | boolean;
}

// ---------------------------------------------------------------------------
// Capabilities — what a data provider can supply. The DataService router uses
// these to pick which plugin to call for a given need.
// ---------------------------------------------------------------------------
export const DataCapability = {
  PROFILE: "profile",
  QUOTE: "quote",
  FINANCIALS: "financials",
  PEERS: "peers",
  ESTIMATES: "estimates",
  NEWS: "news",
  FILINGS: "filings",
  SEARCH: "search",
} as const;
export type DataCapability =
  (typeof DataCapability)[keyof typeof DataCapability];

// Sentinel a provider returns when it does not implement a capability for the
// given input (lets the router fall through to the next provider).
export const NOT_SUPPORTED = Symbol("NOT_SUPPORTED");
export type NotSupported = typeof NOT_SUPPORTED;
export function isNotSupported<T>(v: T | NotSupported): v is NotSupported {
  return v === NOT_SUPPORTED;
}

// ---------------------------------------------------------------------------
// Normalized domain types (the canonical shapes every data plugin maps into).
// ---------------------------------------------------------------------------
export interface NormalizedProfile {
  ticker: string;
  name: string;
  exchange?: string;
  sector?: string;
  industry?: string;
  country?: string;
  cik?: string;
  description?: string;
}

export interface NormalizedQuote {
  ticker: string;
  asOf: string; // ISO
  price?: number;
  marketCap?: number;
  enterpriseValue?: number;
}

export interface NormalizedPeriod {
  periodType: "FY" | "Q";
  fiscalDate: string; // ISO
  revenue?: number;
  grossProfit?: number;
  opIncome?: number;
  ebitda?: number;
  netIncome?: number;
  ocf?: number;
  capex?: number;
  fcf?: number;
  totalDebt?: number;
  cash?: number;
  shares?: number;
  reliability?: ReliabilityFlag;
}

export interface NormalizedFinancials {
  ticker: string;
  periods: NormalizedPeriod[];
}

export interface NormalizedPeer {
  ticker: string;
  name?: string;
}

export interface NormalizedNewsItem {
  title: string;
  url: string;
  source?: string;
  publishedAt?: string; // ISO
  summary?: string;
}

export interface NormalizedFiling {
  type: string; // 10-K, 10-Q, 8-K, etc.
  filedAt?: string;
  url: string;
  title?: string;
}

export interface SearchResult {
  ticker: string;
  name: string;
  exchange?: string;
}

// Every provider response is wrapped so callers always know the origin and
// freshness of the data, supporting the app's reliability-flag UX.
export interface ProviderResult<T> {
  data: T;
  providerKey: string;
  fetchedAt: string; // ISO
}

// ---------------------------------------------------------------------------
// Data provider runtime interface. Each method may return NOT_SUPPORTED.
// ---------------------------------------------------------------------------
export interface DataProvider {
  readonly key: string;
  getProfile(
    ticker: string,
  ): Promise<ProviderResult<NormalizedProfile> | NotSupported>;
  getQuote(
    ticker: string,
  ): Promise<ProviderResult<NormalizedQuote> | NotSupported>;
  getFinancials(
    ticker: string,
    opts?: { years?: number; quarterly?: boolean },
  ): Promise<ProviderResult<NormalizedFinancials> | NotSupported>;
  getPeers(
    ticker: string,
  ): Promise<ProviderResult<NormalizedPeer[]> | NotSupported>;
  getNews(
    query: string,
  ): Promise<ProviderResult<NormalizedNewsItem[]> | NotSupported>;
  getFilings(
    ticker: string,
  ): Promise<ProviderResult<NormalizedFiling[]> | NotSupported>;
  search(query: string): Promise<ProviderResult<SearchResult[]> | NotSupported>;
  /** Lightweight check that the plugin is configured & reachable. */
  healthCheck(): Promise<{ ok: boolean; message?: string }>;
}

export type PluginConfig = Record<string, string | number | boolean>;

export interface DataProviderPlugin {
  manifest: {
    key: string;
    name: string;
    description: string;
    kind: "DATA";
    capabilities: DataCapability[];
    configFields: PluginConfigField[];
    docsUrl?: string;
    /** true if usable with no API key (e.g. SEC EDGAR). */
    keyless?: boolean;
  };
  create(config: PluginConfig): DataProvider;
}

// ---------------------------------------------------------------------------
// LLM provider contract.
// ---------------------------------------------------------------------------
export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LLMCompletionRequest {
  system?: string;
  messages: LLMMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMCompletionResult {
  text: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface LLMProvider {
  readonly key: string;
  complete(req: LLMCompletionRequest): Promise<LLMCompletionResult>;
  healthCheck(): Promise<{ ok: boolean; message?: string }>;
}

export interface LLMModelOption {
  id: string;
  label: string;
  /** suggested role: heavy reasoning vs. cheap drafting/extraction. */
  tier: "reasoning" | "drafting" | "extraction";
}

export interface LLMProviderPlugin {
  manifest: {
    key: string;
    name: string;
    description: string;
    kind: "LLM";
    configFields: PluginConfigField[];
    models: LLMModelOption[];
    docsUrl?: string;
  };
  create(config: PluginConfig): LLMProvider;
}

export type AnyPlugin = DataProviderPlugin | LLMProviderPlugin;
