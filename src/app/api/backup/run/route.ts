import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Genera un backup del DB SQLite (solo se non esiste già uno per oggi).
 * Path: ~/Library/Application Support/MoneybirdFinance/backups/dev-YYYY-MM-DD.db
 * Mantiene gli ultimi 30 backup, cancella i più vecchi.
 */
export async function POST() {
  const dbPath = path.resolve(process.cwd(), "dev.db");
  if (!fs.existsSync(dbPath)) {
    return NextResponse.json({ error: "DB sorgente non trovato" }, { status: 404 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const backupDir = path.join(
    os.homedir(),
    "Library",
    "Application Support",
    "MoneybirdFinance",
    "backups",
  );
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });

  const backupName = `dev-${today}.db`;
  const dest = path.join(backupDir, backupName);

  let created = false;
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(dbPath, dest);
    created = true;
  }

  // Pulizia: tieni gli ultimi 30
  const files = fs
    .readdirSync(backupDir)
    .filter((f) => f.endsWith(".db"))
    .sort()
    .reverse();
  let removed = 0;
  for (const old of files.slice(30)) {
    fs.unlinkSync(path.join(backupDir, old));
    removed++;
  }

  // Aggiorna setting con timestamp ultimo backup
  await prisma.setting
    .upsert({
      where: { key: "backupLastRun" },
      create: { key: "backupLastRun", value: new Date().toISOString() },
      update: { value: new Date().toISOString() },
    })
    .catch(() => null);

  return NextResponse.json({
    ok: true,
    backupDir,
    file: dest,
    created,
    kept: Math.min(files.length, 30),
    removed,
  });
}

export async function GET() {
  const backupDir = path.join(
    os.homedir(),
    "Library",
    "Application Support",
    "MoneybirdFinance",
    "backups",
  );
  if (!fs.existsSync(backupDir)) {
    return NextResponse.json({ enabled: false, files: [], dir: backupDir });
  }
  const files = fs
    .readdirSync(backupDir)
    .filter((f) => f.endsWith(".db"))
    .sort()
    .reverse()
    .slice(0, 10)
    .map((name) => {
      const stat = fs.statSync(path.join(backupDir, name));
      return { name, size: stat.size, mtime: stat.mtime.toISOString() };
    });
  return NextResponse.json({ enabled: true, files, dir: backupDir });
}
