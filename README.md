# StockAnalyst

A **local-first, single-user** investment research tool. It analyzes single
stocks the way a skeptical buy-side associate would: restating your thesis,
finding hidden assumptions, building the bear case, computing what the market
is pricing in, and generating a grounded, scored, sized investment memo.

> Research support, not investment advice. No guarantees.
>
> Grounded analysis sends the computed data packet (and, in future versions,
> relevant excerpts from files you attach) to your configured LLM provider —
> that is the core function of this app. Nothing is sent anywhere else.

## v1 scope

**Phases 0–2 are the product.** Single-stock analysis end to end. Sector/theme
analysis, file upload (PDF via unpdf; images/scans via the Claude vision API —
not tesseract), portfolio tracking, and thesis tracking are explicitly out of
scope until approved after using v1.

## What it does

- **Data spine** — FMP (base: fundamentals, quotes, ratios, price history,
  peers) + SEC EDGAR (authoritative XBRL fundamentals, keyless). Cross-provider
  **reconciliation** per [docs/normalization-policy.md](docs/normalization-policy.md):
  >2% disagreements resolve to EDGAR, and the losing value is **stored and
  surfaced**, never discarded. Every figure carries a reliability flag
  (`REPORTED/DERIVED/PROXY/STALE/MISSING`).
- **Deterministic analytics** — margins, growth, FCF, ROIC, leverage, dilution,
  realized volatility, valuation multiples with historical percentiles, and a
  **reverse DCF** (10y horizon, 2.5% perpetuity terminal growth — pinned;
  discount rate configurable, default 10%) that states what FCF growth today's
  price implies. All pure functions, all unit-tested.
- **Transparent scoring** — 9 categories, 0–100 with letter bands. Qualitative
  categories score **comparatively against the peer set** when ≥3 peers carry
  the metric. Scores above 80 or below 40 require ≥2 evidence refs or the
  engine **clamps and flags** them. Data completeness caps confidence.
- **Deterministic sizing** — `base(confidence) × riskAdj × volAdj(realized
  vol)`, capped at the single-name limit, formula shown in full. Pairwise
  correlation activates with the portfolio phase.
- **Skeptical memo pipeline** — critique → bull → bear (adversarial) →
  disconfirming evidence → synthesis, each Zod-validated. The LLM receives the
  packet as read-only data and **never generates numbers, implied growth,
  scores, or sizing** — a code-side **audit pass** flags any figure in the
  prose that doesn't trace to the packet.
- **Cost accounting** — token usage is estimated per depth tier (quick /
  standard / deep) before the run and shown in the job UI; actual tokens and
  USD cost are stored on the memo.
- **Plugin system** — data and LLM providers are self-registering plugins with
  manifests (capabilities, config schema, model pricing). Adding a provider =
  one file + one import line. Anthropic, OpenAI, and a keyless **Mock** LLM
  (real numbers, placeholder narrative — for trying the app without a key) are
  included.

## Getting started

```bash
cp .env.example .env.local      # set a strong APP_SECRET (>=16 chars)
npm install                     # runs prisma generate
npm run db:migrate              # creates ./data/app.db
npm run dev                     # http://localhost:3000
```

Then in **Settings**:

1. Enable **SEC EDGAR** (free — just set a User-Agent like
   `Your Name you@example.com`) and/or add an **FMP** key (needed for quotes,
   price history, ratios, peers).
2. Enable an LLM provider — **Mock** needs no key; Anthropic/OpenAI need one.
3. Run an analysis from **New Analysis**.

Keys are encrypted at rest (AES-256-GCM keyed by `APP_SECRET`), never sent to
the browser, and never leave your machine except to the provider they belong to.

## Architecture

- `docs/normalization-policy.md` — the reconciliation policy (a first-class
  workstream; its rules are implemented in `edgar.normalize.ts` +
  `reconcile.ts` and tested)
- `src/lib/plugins/` — provider plugin contracts, registry, FMP/EDGAR/LLM plugins
- `src/lib/data/` — cache-through HTTP, reconciliation, capability router
- `src/lib/calc/` — pure math, reverse DCF, the Calc Engine (Financial Packet)
- `src/lib/scoring/`, `src/lib/sizing/` — deterministic scoring + sizing
- `src/lib/memo/` — prompts, pipeline, grounding audit
- `src/lib/jobs/` — in-process job runner with progress + cost
- `src/app/` — Home, New Analysis, Company, memo view, Settings + `/api/*`

Run `npm test` for the unit suite (math, reverse DCF, reconciliation policy
obligations, normalizers, calc engine, scoring incl. the clamp rule, sizing,
cost estimation, audit, pipeline, persistence).
