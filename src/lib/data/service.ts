// DataService — the capability router over enabled data-provider plugins.
//
// For each capability it tries providers in configured priority order and
// falls through on NOT_SUPPORTED / error, recording provenance for every datum
// that lands. buildPacket() additionally runs the cross-provider
// reconciliation from docs/normalization-policy.md when both FMP and EDGAR
// return fundamentals, persisting any >2% disagreements.
import "server-only";
import { prisma } from "@/lib/db";
import { ensurePluginsRegistered } from "@/lib/plugins/bootstrap";
import { registry } from "@/lib/plugins/registry";
import { getRuntimeConfig } from "@/lib/provider-config";
import { getSetting } from "@/lib/app-settings";
import {
  isNotSupported,
  type DataProvider,
  type NormalizedFinancials,
  type NormalizedHistoricalRatio,
  type NormalizedPeer,
  type NormalizedPricePoint,
  type NormalizedProfile,
  type NormalizedQuote,
  type ProviderResult,
  type SearchResult,
} from "@/lib/plugins/types";
import { reconcileFinancials, type Discrepancy } from "./reconcile";
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

  private byKey(key: string): DataProvider | null {
    return this.providers.find((p) => p.key === key)?.provider ?? null;
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
  getPriceHistory(ticker: string) {
    return this.firstOf<NormalizedPricePoint[]>((p) =>
      p.getPriceHistory(ticker),
    );
  }
  getPeers(ticker: string) {
    return this.firstOf<NormalizedPeer[]>((p) => p.getPeers(ticker));
  }
  search(query: string) {
    return this.firstOf<SearchResult[]>((p) => p.search(query));
  }

  // Pulls fundamentals from the base provider chain AND EDGAR specifically,
  // reconciles per policy, and persists disagreements.
  private async reconciledFinancials(ticker: string): Promise<{
    financials: NormalizedFinancials;
    discrepancies: Discrepancy[];
    provenance: SourceProvenance[];
  }> {
    const provenance: SourceProvenance[] = [];
    const base = await this.getFinancials(ticker);
    if (base)
      provenance.push({
        capability: "financials",
        providerKey: base.providerKey,
        fetchedAt: base.fetchedAt,
      });

    let financials = base?.data ?? { ticker, periods: [] };
    let discrepancies: Discrepancy[] = [];

    // Cross-check only applies when the base data did NOT come from EDGAR and
    // an EDGAR provider is enabled.
    const edgarProvider = this.byKey("edgar");
    if (base && base.providerKey !== "edgar" && edgarProvider) {
      try {
        const edgarRes = await edgarProvider.getFinancials(ticker);
        if (!isNotSupported(edgarRes)) {
          const r = reconcileFinancials(financials, edgarRes.data);
          financials = r.financials;
          discrepancies = r.discrepancies;
          provenance.push({
            capability: "financials_crosscheck",
            providerKey: "edgar",
            fetchedAt: edgarRes.fetchedAt,
          });
          if (discrepancies.length) {
            await prisma.reconciliation.createMany({
              data: discrepancies.map((d) => ({
                ticker,
                field: d.field,
                fiscalDate: d.fiscalDate,
                chosenProvider: d.chosenProvider,
                chosenValue: d.chosenValue,
                otherProvider: d.otherProvider,
                otherValue: d.otherValue,
                pctDiff: d.pctDiff,
              })),
            });
          }
        }
      } catch {
        // Cross-check is best-effort; base data stands if EDGAR is unreachable.
      }
    }

    return { financials, discrepancies, provenance };
  }

  // Orchestrates a full data pull for one ticker and runs the Calc Engine.
  async buildPacket(
    ticker: string,
    opts: { peerLimit?: number } = {},
  ): Promise<FinancialPacket> {
    const peerLimit = opts.peerLimit ?? 5;
    const sources: SourceProvenance[] = [];
    const record = (capability: string, r: ProviderResult<unknown> | null) => {
      if (r)
        sources.push({
          capability,
          providerKey: r.providerKey,
          fetchedAt: r.fetchedAt,
        });
    };

    const valuationPolicy = await getSetting("valuationPolicy");

    const [profileR, quoteR, fin, ratiosR, pricesR, peersR] = await Promise.all([
      this.getProfile(ticker),
      this.getQuote(ticker),
      this.reconciledFinancials(ticker),
      this.getHistoricalRatios(ticker),
      this.getPriceHistory(ticker),
      this.getPeers(ticker),
    ]);
    record("profile", profileR);
    record("quote", quoteR);
    sources.push(...fin.provenance);
    record("historical_ratios", ratiosR);
    record("price_history", pricesR);
    record("peers", peersR);

    const profile: NormalizedProfile = profileR?.data ?? { ticker, name: ticker };

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
      financials: fin.financials,
      historicalRatios: ratiosR?.data,
      priceHistory: pricesR?.data,
      peers: peerInputs,
      sources,
      discrepancies: fin.discrepancies,
      discountRatePct: valuationPolicy.discountRatePct,
    });
  }
}
