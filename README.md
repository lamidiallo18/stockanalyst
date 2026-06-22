# StockAnalyst

A **local-first, single-user** investment research and portfolio-screening tool.
It helps you analyze single stocks, sectors, and themes the way a skeptical
buy-side associate would: restating your thesis, identifying what must be true,
surfacing disconfirming evidence, and generating a rigorous investment memo.

> Research support, not investment advice. No guarantees.

## Status

Built in phases.

**Phase 0 (Foundation) — complete:**

- Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4
- SQLite via Prisma 7 (driver-adapter model), full data model + migrations
- **Plugin system** for data + LLM providers (FMP, SEC EDGAR, Anthropic registered)
- Encrypted-at-rest API key storage (AES-256-GCM)
- Settings page that discovers plugins and manages their config/keys
- Dashboard shell with all pages scaffolded

**Phase 1 (Data Spine) — complete:**

- Live **FMP** and **SEC EDGAR** provider implementations (normalization isolated
  in pure, unit-tested modules)
- Cache-through HTTP layer (per-endpoint TTLs via the `DataCache` table)
- **DataService** capability router: priority order, fallback, provenance
  tracking, graceful degradation
- Deterministic **Calc Engine**: growth, margins, FCF, ROIC/ROE, leverage,
  dilution, current + historical valuation multiples — every value tagged with a
  reliability flag (`REPORTED/DERIVED/PROXY/STALE/MISSING`)
- **47 unit tests** covering the math, the engine, and both providers'
  normalization
- **Company Analysis** page wired to live data with reliability badges,
  data-completeness scoring, historical multiple ranges, trend table, and peer
  comps

**Phase 2 (Memo Pipeline) — complete:**

- LLM provider plugins: **Anthropic** + **OpenAI** (live, via REST — no SDK dep)
  and a deterministic **Mock** provider (offline; runs the whole app with real
  computed numbers + placeholder narrative, no key needed)
- **LLMService** router: picks the enabled provider, resolves model by task tier
  (reasoning / drafting / extraction) from the plugin's own catalog
- Multi-stage **memo pipeline**: deterministic scoring → thesis critique → bull
  → **bear (adversarial)** → disconfirming evidence → grounded section synthesis
- **Grounding contract + audit pass**: the LLM gets the Financial Packet as
  read-only data; a code-side audit flags any figure in the prose it can't trace
  back to the packet ("⚠ unverified figure")
- Transparent **Scoring Engine**: 10 categories scored deterministically with
  evidence + signals + data-completeness; the LLM only writes rationale
- In-process **job runner** with DB-backed progress; **New Analysis** wizard with
  live progress, and a **memo view** (rating, sizing, scorecard, Markdown export)
- **63 unit/integration tests** (math, calc, providers, scoring, audit, full
  pipeline via mock, DB persistence round-trip)

Next: file ingestion (3) → portfolio & thesis tracker (4) → sector/theme +
export (5).

> **No LLM key?** Enable the **Mock (offline demo)** provider in Settings to
> click through the entire flow. The numbers and scores are real (computed
> locally); only the narrative is placeholder. Swap in Anthropic or OpenAI
> anytime for genuine analysis — it's just a plugin.

> **Note on live data:** fetching real financials requires outbound network
> access to FMP / SEC. The deterministic core (normalization + Calc Engine) is
> verified offline via unit tests (`npm test`); live fetches work when you run
> the app on a machine with normal internet access and an enabled provider.

## Getting started

```bash
cp .env.example .env.local      # then set a strong APP_SECRET
npm install                     # runs prisma generate
npm run db:migrate              # applies migrations, creates ./data/app.db
npm run dev                     # http://localhost:3000
```

Open **Settings** to add your FMP and Anthropic API keys. Keys are encrypted
with `APP_SECRET` and stored in the local SQLite DB — they never reach the
browser and never leave your machine except when calling the provider you
configured.

## Architecture

- `src/lib/plugins/` — provider plugin contracts + registry (the swappable core)
- `src/lib/provider-config.ts` — bridges plugins ↔ encrypted DB storage
- `src/lib/crypto.ts` — AES-256-GCM secret encryption
- `src/lib/db.ts` — Prisma client (better-sqlite3 adapter)
- `prisma/schema.prisma` — full data model (companies, analyses, memos, scores,
  sources, portfolio, thesis tracking, jobs, cache)
- `src/app/` — dashboard pages + `/api` route handlers

### Adding a new data or LLM provider (the plugin model)

Providers are plugins — **no core changes needed** to add one:

1. Create a file under `src/lib/plugins/data/` (or `llm/`) exporting a plugin
   object that implements the contract in `src/lib/plugins/types.ts`
   (a `manifest` describing capabilities + config fields, and a `create()`
   factory returning a normalized provider instance).
2. Register it with one import + line in the matching `index.ts`.

The registry and Settings UI discover it automatically. Each provider maps its
raw API into the app's **normalized** types, so the rest of the app never
depends on any single vendor's schema.

## Data & privacy

- All provider/LLM calls happen server-side; secrets stay out of the browser.
- Uploaded files (Phase 3) are stored under `./data/uploads/`, content-hashed.
- `./data` and `.env*` are gitignored — nothing sensitive is committable.
