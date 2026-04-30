import { NextResponse } from "next/server";
import { getSystemInfo } from "@/lib/system-info";

export const runtime = "nodejs";

/**
 * Auto-collected system info (no PII). Verrà inclusa come metadata negli
 * snapshot di debug e nelle segnalazioni di crash (Sentry context).
 */
export async function GET() {
  return NextResponse.json(getSystemInfo());
}
