import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

export async function GET() {
  const dbPath = path.resolve(process.cwd(), "dev.db");
  if (!fs.existsSync(dbPath)) {
    return NextResponse.json({ error: "DB non trovato" }, { status: 404 });
  }
  const data = fs.readFileSync(dbPath);
  return new NextResponse(data, {
    headers: {
      "Content-Type": "application/x-sqlite3",
      "Content-Disposition": `attachment; filename="moneybird-finance-backup-${new Date().toISOString().slice(0, 10)}.db"`,
    },
  });
}
