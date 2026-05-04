#!/usr/bin/env bash
# Pre-build hook eseguito da Tauri prima di tauri build.
#
# Steps:
#   1. Build Next.js standalone (next.config ha output: "standalone")
#   2. Compone src-tauri/standalone/ con TUTTO ciò che serve a runtime:
#      - server.js + node_modules (dal standalone)
#      - .next/static/ (Next non lo include in standalone, va copiato)
#      - public/ (assets statici)
#      - prisma/schema.prisma (per migrate al primo run)
#   3. Copia il binario Node arch-specific in src-tauri/binaries/

set -e

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

echo "→ [tauri-prebuild] Sync templates community → bundle locale..."
# Best-effort: se il registry è down o offline, prosegui con quello che c'è.
# Il file generato è gitignored, ogni build lo rigenera.
npm run sync-templates 2>&1 || echo "  ⚠ sync-templates non riuscito, uso bundle esistente"

echo "→ [tauri-prebuild] Next.js standalone build..."
npm run build

# Compose standalone bundle in src-tauri/standalone
echo "→ [tauri-prebuild] Compongo src-tauri/standalone..."
rm -rf src-tauri/standalone
mkdir -p src-tauri/standalone
# Standalone contiene server.js, node_modules, prisma, src (per instrumentation), package.json
cp -R .next/standalone/. src-tauri/standalone/
# .env del bundle: SOLO chiavi safe-to-distribute (mai DATABASE_URL/master key).
# Tauri lib.rs setta DATABASE_URL runtime, ensureMasterKey gen on-the-fly.
rm -f src-tauri/standalone/.env src-tauri/standalone/.env.local 2>/dev/null || true
{
  echo "# Piggybird app .env baked — NON modificare"
  for key in PIGGYBIRD_STATS_URL BETA_AI_FALLBACK_KEY SENTRY_DSN NEXT_PUBLIC_SENTRY_DSN GITHUB_TOKEN GITHUB_REPO; do
    val=$(grep "^${key}=" .env 2>/dev/null | head -1 | sed "s/^${key}=//")
    if [ -n "$val" ]; then
      echo "${key}=${val}"
    fi
  done
} > src-tauri/standalone/.env
chmod 600 src-tauri/standalone/.env
echo "  ↳ .env baked: $(grep -c '=' src-tauri/standalone/.env) keys"
# .next/static (CSS + JS chunks) NON è in standalone, va copiato manuale
mkdir -p src-tauri/standalone/.next/static
cp -R .next/static/. src-tauri/standalone/.next/static/
# Public assets (icons, immagini)
if [ -d "public" ]; then
  cp -R public src-tauri/standalone/public
fi
# Prisma schema serve a runtime per migrate (ensureMasterKey + first-run setup)
mkdir -p src-tauri/standalone/prisma
cp prisma/schema.prisma src-tauri/standalone/prisma/

# Genera SQL DDL della schema "from-empty" → applicabile via better-sqlite3
# senza serve la prisma CLI a runtime (che NFT non bundla).
echo "→ [tauri-prebuild] Genero schema SQL..."
npx prisma migrate diff \
  --from-empty \
  --to-schema prisma/schema.prisma \
  --script \
  > src-tauri/standalone/prisma/init.sql

# Init script: bootstrap se DB nuovo, OPPURE migrazione additiva se esistente.
# Limitazione: gestisce solo CREATE TABLE nuove + ADD COLUMN. Drop/rename/type
# changes richiedono migrazioni esplicite (TBD se mai necessarie).
cat > src-tauri/standalone/init-db.js <<'INIT_EOF'
// Esecuzione al boot dell'app:
//   - DB vergine (no Setting table) → apply schema completo da init.sql
//   - DB esistente → parse init.sql, ADD COLUMN per colonne mancanti,
//     CREATE TABLE per tabelle nuove (additive only)
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const dbPath = (process.env.DATABASE_URL || "").replace(/^file:/, "");
if (!dbPath) {
  console.error("[init-db] DATABASE_URL not set");
  process.exit(1);
}

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

const sqlPath = path.join(__dirname, "prisma", "init.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

const hasSetting = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='Setting'")
  .get();

if (!hasSetting) {
  console.log("[init-db] DB nuovo, applico schema completo");
  db.exec(sql);
  db.close();
  console.log("[init-db] OK (bootstrap)");
  process.exit(0);
}

// Schema-additive migration: parse CREATE TABLE blocks e applica ALTER ADD
// COLUMN per ogni colonna che manca nel DB esistente.
console.log("[init-db] schema esistente, controllo migrazioni additive");
let altered = 0;

const tableRe = /CREATE\s+TABLE\s+"([^"]+)"\s*\(([\s\S]*?)\n\);/g;
let m;
while ((m = tableRe.exec(sql)) !== null) {
  const tableName = m[1];
  const body = m[2];
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const cols = [];
  for (const line of lines) {
    // Salta righe di constraint multi-colonna
    if (/^(CONSTRAINT|FOREIGN\s+KEY|PRIMARY\s+KEY\s*\()/i.test(line)) continue;
    const cm = /^"([^"]+)"\s+(.+?),?\s*$/.exec(line);
    if (!cm) continue;
    cols.push({ name: cm[1], def: cm[2].replace(/,$/, "").trim() });
  }

  const tableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(tableName);
  if (!tableExists) {
    console.log("[init-db] CREATE TABLE " + tableName);
    db.exec(m[0]);
    altered++;
    continue;
  }

  const existingCols = new Set(
    db.prepare("PRAGMA table_info(\"" + tableName + "\")").all().map((r) => r.name),
  );
  for (const col of cols) {
    if (existingCols.has(col.name)) continue;
    // SQLite ADD COLUMN: rimuovi PRIMARY KEY/UNIQUE; se NOT NULL senza DEFAULT,
    // rimuovi NOT NULL (alternativa: forzare DEFAULT NULL ma rompe semantics).
    let def = col.def
      .replace(/\bPRIMARY\s+KEY\b/gi, "")
      .replace(/\bUNIQUE\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    if (/NOT NULL/i.test(def) && !/DEFAULT/i.test(def)) {
      def = def.replace(/NOT NULL/gi, "").trim();
    }
    try {
      const stmt = "ALTER TABLE \"" + tableName + "\" ADD COLUMN \"" + col.name + "\" " + def;
      console.log("[init-db] " + tableName + "." + col.name + ": " + def);
      db.exec(stmt);
      altered++;
    } catch (e) {
      console.error("[init-db] FAIL " + tableName + "." + col.name + ": " + e.message);
      // Continua: meglio app parzialmente migrata che boot bloccato
    }
  }
}

if (altered === 0) {
  console.log("[init-db] schema già allineato, nessuna modifica");
} else {
  console.log("[init-db] OK (" + altered + " modifiche additive applicate)");
}
db.close();
INIT_EOF

# Verifica Node binary per sidecar
ARCH=$(uname -m)
case "$ARCH" in
  arm64)  TARGET_TRIPLE="aarch64-apple-darwin" ;;
  x86_64) TARGET_TRIPLE="x86_64-apple-darwin" ;;
  *) echo "❌ Arch sconosciuta: $ARCH"; exit 1 ;;
esac

NODE_BIN="src-tauri/binaries/node-${TARGET_TRIPLE}"
if [ ! -f "$NODE_BIN" ]; then
  echo "❌ Manca il Node binary: $NODE_BIN"
  echo "   Eseguire: ./tools/download-node-binary.sh"
  exit 1
fi
chmod +x "$NODE_BIN"

# Workaround Turbopack/Next: il bundle referenzia @prisma/client via alias
# hashed (es. @prisma/client-2c3a283f134fdcb6) per security/prototype-pollution
# protection. Il modulo reale è @prisma/client. Estraggo gli hash dal bundle
# e creo i corrispondenti symlink in node_modules così il require() trova il
# modulo. Fix per "Cannot find module @prisma/client-XXXX/runtime/client".
echo "→ [tauri-prebuild] Risolvo alias hashed Turbopack..."
# Pattern: <pkg>-<16-hex>  (es. client-2c3a283f134fdcb6)
# Pattern scoped: @scope/<pkg>-<16-hex>  (es. @prisma/client-2c3a283f134fdcb6)
# Estraggo tutti gli alias dal bundle compilato e creo copie nei node_modules.
SCOPED=$(grep -rhoE "@[a-z0-9-]+/[a-z0-9-]+-[a-f0-9]{16}" \
  src-tauri/standalone/.next/server/ 2>/dev/null | sort -u)
UNSCOPED=$(grep -rhoE "(^|[^@/])([a-z][a-z0-9-]+)-[a-f0-9]{16}" \
  src-tauri/standalone/.next/server/ 2>/dev/null \
  | grep -oE "[a-z][a-z0-9-]+-[a-f0-9]{16}" \
  | sort -u)

for alias_name in $SCOPED; do
  orig=$(echo "$alias_name" | sed -E 's|-[a-f0-9]{16}$||')
  src="src-tauri/standalone/node_modules/${orig}"
  dest="src-tauri/standalone/node_modules/${alias_name}"
  if [ -d "$src" ] && [ ! -e "$dest" ]; then
    cp -R "$src" "$dest"
    echo "  ↳ scoped: ${orig} → ${alias_name}"
  fi
done

for alias_name in $UNSCOPED; do
  # Skip se già processato come scoped (es. se appare anche unscoped per caso)
  orig=$(echo "$alias_name" | sed -E 's|-[a-f0-9]{16}$||')
  src="src-tauri/standalone/node_modules/${orig}"
  dest="src-tauri/standalone/node_modules/${alias_name}"
  if [ -d "$src" ] && [ ! -e "$dest" ]; then
    cp -R "$src" "$dest"
    echo "  ↳ unscoped: ${orig} → ${alias_name}"
  fi
done

echo "→ [tauri-prebuild] Standalone bundle pronto:"
du -sh src-tauri/standalone src-tauri/binaries 2>/dev/null
echo "→ [tauri-prebuild] OK, prossimo step: cargo tauri build"
