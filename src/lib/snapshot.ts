import { gzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createIssue, uploadFile } from "./github";
import { getSystemInfo } from "./system-info";
import { getUserProfile } from "./user-profile";

/**
 * Snapshot di debug: gzip del dev.db locale + Issue su GitHub con metadata
 * (sistema, profilo utente, messaggio opzionale). Tutto opt-in, l'utente
 * clicca esplicitamente.
 *
 * Architettura:
 *   1. Legge `dev.db` (path da DATABASE_URL o convenzione "./dev.db")
 *   2. Gzip in memoria (~7MB raw → ~2MB compressed per un DB tipico)
 *   3. Upload su GitHub Contents API a `snapshots/<timestamp>_<userhash>.db.gz`
 *   4. Crea Issue con titolo "[Snapshot] <name> — <message>" e body in MD
 *   5. Ritorna URL dell'issue da mostrare all'utente
 */

export type SnapshotResult = {
  issueUrl: string;
  issueNumber: number;
  fileUrl: string;
  filePath: string;
  sizeBytes: number;
};

/**
 * Estrae il path del file SQLite dal DATABASE_URL prisma. Supporta:
 *   - "file:./dev.db" → path relativo cwd (default Next.js dev)
 *   - "file:dev.db" → path relativo
 *   - "file:/abs/path.db" → assoluto
 */
function resolveDbPath(): string {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const m = url.match(/^file:(.*)$/);
  const raw = m ? m[1] : "./dev.db";
  if (raw.startsWith("/")) return raw;
  // Prisma risolve relativi a `prisma/` directory; ma il convention Piggybird
  // mette dev.db nella root dell'app/. Proviamo entrambi.
  const candidates = [
    join(process.cwd(), raw.replace(/^\.\//, "")),
    join(process.cwd(), "prisma", raw.replace(/^\.\//, "")),
  ];
  return candidates[0]; // primo è il più probabile per Piggybird
}

/** Slug user per nome file: usa local-part dell'email (lowercase, no dots). */
function userSlug(email: string): string {
  const local = email.split("@")[0] ?? "anon";
  return local.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function submitDebugSnapshot(opts: {
  userMessage: string;
}): Promise<SnapshotResult> {
  const profile = await getUserProfile();
  if (!profile.name || !profile.email) {
    throw new Error("Profilo utente incompleto (name/email mancanti)");
  }
  const sys = getSystemInfo();

  // 1. Read + gzip DB
  const dbPath = resolveDbPath();
  let dbBuffer: Buffer;
  try {
    dbBuffer = await readFile(dbPath);
  } catch (e) {
    throw new Error(`Impossibile leggere il DB locale (${dbPath}): ${e instanceof Error ? e.message : e}`);
  }
  const gz = gzipSync(dbBuffer);

  // 2. Upload file
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19); // 2026-04-30T15-30-12
  const slug = userSlug(profile.email);
  const filePath = `snapshots/${ts}_${slug}.db.gz`;
  const uploaded = await uploadFile(
    filePath,
    gz,
    `Snapshot from ${slug} — ${ts}`,
  );

  // 3. Create issue with metadata
  // PRIVACY: il repo Piggybird è pubblico, le issue sono visibili a tutti.
  // Niente PII identificativi nel body (nome, email, paesi, età, famiglia,
  // ecc.). Il dev riconosce chi ha mandato lo snapshot dal local-part email
  // nel nome file (`<ts>_<slug>.db.gz`) → identificativo minimo. La email
  // completa NON va in plaintext.
  const truncated = (opts.userMessage ?? "").trim().slice(0, 4000);
  const title = `[Snapshot] ${slug}${truncated ? ` — ${truncated.split("\n")[0].slice(0, 60)}` : ""}`;
  const body = [
    `## 💻 Sistema`,
    `- **App version:** ${sys.appVersion}`,
    `- **Platform:** ${sys.platform} ${sys.osVersion} (${sys.arch})`,
    `- **Node:** ${sys.nodeVersion}`,
    `- **Locale:** ${sys.locale}`,
    `- **Timezone:** ${sys.tz}`,
    ``,
    `## 💬 Messaggio utente`,
    truncated || "_(nessun messaggio)_",
    ``,
    `## 📦 Database snapshot`,
    `- **File:** [\`${filePath}\`](${uploaded.content.html_url})`,
    `- **Size compressed:** ${(gz.length / 1024).toFixed(1)} KB (raw: ${(dbBuffer.length / 1024).toFixed(1)} KB)`,
    `- **Download diretto:** ${uploaded.content.download_url}`,
    ``,
    `---`,
    `_Auto-generated da Piggybird debug snapshot uploader._`,
  ].join("\n");

  const issue = await createIssue(title, body, ["snapshot", "beta-bug"]);

  return {
    issueUrl: issue.html_url,
    issueNumber: issue.number,
    fileUrl: uploaded.content.html_url,
    filePath,
    sizeBytes: gz.length,
  };
}
