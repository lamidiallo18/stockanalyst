// DataService — the capability router over enabled data-provider plugins.
//
// For each capability it tries providers in configured priority order and
// falls through on NOT_SUPPORTED / error, recording provenance for every datum
// that lands. This is the single seam the rest of the app uses to fetch data;
// it never knows or cares which vendor answered.
import "server-only";
import { prisma } from "@/lib/db";
import { ensurePluginsRegistered } from "@/lib/plugins/bootstrap";
import { registry } from "@/lib/plugins/registry";
import { getRuntimeConfig } from "@/lib/provider-config";
import {
  isNotSupported,
  type DataProvider,
  type NormalizedFinancials,
  type NormalizedHistoricalRatio,
  type NormalizedNewsItem,
  type NormalizedPeer,
  type NormalizedProfile,
  type NormalizedQuote,
  type ProviderResult,
  type SearchResult,
} from "@/lib/plugins/types";
import { computePacket, type CalcPeerInput } from "@/lib/calc/engine";
import type { FinancialPacket, SourceProvenance } from "@/lib/calc/types";

interface ActiveProvider {
  provider: DataProvider;
  priority: number;
  key: string;
}

export class DataService {
  private constructor(private providers: ActiveProvider[]) {}

  // Build a service instance from the enabled+configured DATA plugins.
  static async create(): Promise<DataService> {
    ensurePluginsRegistered();
    const configs = await prisma.providerConfig.findMany({
      where: { kind: "DATA", enabled: true },
      orderBy: { priority: "asc" },
    });
    const active: ActiveProvider[] = [];
    for (const cfg of configs) {
      const plugin = registry.getDataPlugin(cfg.providerKey);
      if (!plugin) continue;
      const runtime = await getRuntimeConfig(cfg.providerKey);
      active.push({
        provider: plugin.create(runtime),
        priority: cfg.priority,
        key: cfg.providerKey,
      });
    }
    return new DataService(active);
  }

  get activeKeys(): string[] {
    return this.providers.map((p) => p.key);
  }

  // Runs `fn` against each provider in priority order, returning the first
  // successful (non-NOT_SUPPORTED) result. Provider errors are swallowed so a
  // single failing provider doesn't break the chain.
  private async firstOf<T>(
    fn: (p: DataProvider) => Promise<ProviderResult<T> | symbol>,
  ): Promise<ProviderResult<T> | null> {
    for (const { provider } of this.providers) {
      try {
        const r = await fn(provider);
        if (!isNotSupported(r)) return r as ProviderResult<T>;
      } catch {
        // try next provider
      }
    }
    return null;
  }

  getProfile(ticker: string) {
    return this.firstOf<NormalizedProfile>((p) => p.getProfile(ticker));
  }
  getQuote(ticker: string) {
    return this.firstOf<NormalizedQuote>((p) => p.getQuote(ticker));
  }
  getFinancials(ticker: string, years = 6) {
    return this.firstOf<NormalizedFinancials>((p) =>
      p.getFinancials(ticker, { years }),
    );
  }
  getHistoricalRatios(ticker: string) {
    return this.firstOf<NormalizedHistoricalRatio[]>((p) =>
      p.getHistoricalRatios(ticker),
    );
  }
  getPeers(ticker: string) {
    return this.firstOf<NormalizedPeer[]>((p) => p.getPeers(ticker));
  }
  getNews(query: string) {
    return this.firstOf<NormalizedNewsItem[]>((p) => p.getNews(query));
  }
  getFilings(ticker: string) {
    return this.firstOf((p) => p.getFilings(ticker));
  }
  search(query: string) {
    return this.firstOf<SearchResult[]>((p) => p.search(query));
  }

  // Orchestrates a full data pull for one ticker and runs the Calc Engine.
  // Peers are limited and fetched in parallel; failures degrade gracefully.
  async buildPacket(
    ticker: string,
    opts: { peerLimit?: number } = {},
  ): Promise<FinancialPacket> {
    const peerLimit = opts.peerLimit ?? 5;
    const sources: SourceProvenance[] = [];
    const record = (capability: string, r: ProviderResult<unknown> | null) => {
      if (r) sources.push({ capability, providerKey: r.providerKey, fetchedAt: r.fetchedAt });
    };

    const [profileR, quoteR, finR, ratiosR, peersR] = await Promise.all([
      this.getProfile(ticker),
      this.getQuote(ticker),
      this.getFinancials(ticker),
      this.getHistoricalRatios(ticker),
      this.getPeers(ticker),
    ]);
    record("profile", profileR);
    record("quote", quoteR);
    record("financials", finR);
    record("historical_ratios", ratiosR);
    record("peers", peersR);

    const profile: NormalizedProfile =
      profileR?.data ?? { ticker, name: ticker };
    const financials: NormalizedFinancials =
      finR?.data ?? { ticker, periods: [] };

    // Fetch peer fundamentals in parallel (best-effort, capped).
    const peerTickers = (peersR?.data ?? []).slice(0, peerLimit);
    const peerInputs: CalcPeerInput[] = await Promise.all(
      peerTickers.map(async (peer): Promise<CalcPeerInput> => {
        const [pq, pf] = await Promise.all([
          this.getQuote(peer.ticker).catch(() => null),
          this.getFinancials(peer.ticker, 4).catch(() => null),
        ]);
        return { peer, quote: pq?.data, financials: pf?.data };
      }),
    );

    return computePacket({
      profile,
      quote: quoteR?.data,
      financials,
      historicalRatios: ratiosR?.data,
      peers: peerInputs,
      sources,
    });
  }
}
