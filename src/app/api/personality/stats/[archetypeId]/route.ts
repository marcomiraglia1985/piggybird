import { NextRequest, NextResponse } from "next/server";
import { getArchetypeStats } from "@/lib/personality";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ archetypeId: string }> },
) {
  const { archetypeId } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const city = searchParams.get("city");
  const country = searchParams.get("country");
  const tvRaw = searchParams.get("testVersion");
  const testVersion = tvRaw ? parseInt(tvRaw, 10) : 0;
  const stats = await getArchetypeStats(
    archetypeId,
    city,
    country,
    isFinite(testVersion) && testVersion > 0 ? testVersion : 0,
  );
  return NextResponse.json({ stats });
}
