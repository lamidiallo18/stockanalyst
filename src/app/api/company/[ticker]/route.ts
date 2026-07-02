// GET /api/company/[ticker] -> full FinancialPacket (data spine, no LLM).
// Returns 503 with guidance if no data provider is enabled/configured.
import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data/service";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await ctx.params;
  const symbol = ticker.trim().toUpperCase();
  if (!symbol || !/^[A-Z0-9.\-]{1,12}$/.test(symbol)) {
    return NextResponse.json({ error: "Invalid ticker." }, { status: 400 });
  }

  const service = await DataService.create();
  if (service.activeKeys.length === 0) {
    return NextResponse.json(
      {
        error:
          "No data provider is enabled. Add and enable a provider (e.g. FMP or SEC EDGAR) in Settings.",
      },
      { status: 503 },
    );
  }

  try {
    const packet = await service.buildPacket(symbol);
    if (packet.periods.length === 0 && !packet.quote.price.value) {
      return NextResponse.json(
        {
          error: `No data found for "${symbol}". Check the ticker, or that an enabled provider covers it.`,
          activeProviders: service.activeKeys,
        },
        { status: 404 },
      );
    }
    return NextResponse.json({ packet, activeProviders: service.activeKeys });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to build packet." },
      { status: 500 },
    );
  }
}
