import { NextRequest, NextResponse } from "next/server";
import {
  getCashflowSankeyData,
  type Period,
  type ViewMode,
} from "@/lib/queries/cashflow-sankey";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const period = (searchParams.get("period") ?? "currentMonth") as Period;
  const viewMode = (searchParams.get("viewMode") ?? "groups") as ViewMode;
  const includeCapex = searchParams.get("includeCapex") === "true";
  const includeTransfers = searchParams.get("includeTransfers") === "true";

  if (!["currentMonth", "currentYear", "trailing12Months"].includes(period)) {
    return NextResponse.json({ error: "Invalid period" }, { status: 400 });
  }
  if (!["groups", "detailed"].includes(viewMode)) {
    return NextResponse.json({ error: "Invalid viewMode" }, { status: 400 });
  }

  const data = await getCashflowSankeyData({
    period,
    viewMode,
    includeCapex,
    includeTransfers,
  });
  return NextResponse.json(data);
}
