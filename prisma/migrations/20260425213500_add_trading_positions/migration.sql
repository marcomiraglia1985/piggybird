-- CreateTable
CREATE TABLE "RealizedPnL" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticker" TEXT NOT NULL,
    "name" TEXT,
    "isin" TEXT,
    "dateAcquired" DATETIME NOT NULL,
    "dateSold" DATETIME NOT NULL,
    "quantity" REAL NOT NULL,
    "costBasis" REAL NOT NULL,
    "proceeds" REAL NOT NULL,
    "pnl" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "fxAtSell" REAL NOT NULL DEFAULT 1.0,
    "platform" TEXT NOT NULL DEFAULT 'Revolut',
    "assetType" TEXT NOT NULL DEFAULT 'stock'
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StockPosition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticker" TEXT NOT NULL,
    "name" TEXT,
    "shares" REAL NOT NULL,
    "avgCost" REAL,
    "currentPrice" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "fxToEur" REAL NOT NULL DEFAULT 1.0,
    "platform" TEXT NOT NULL DEFAULT 'Revolut',
    "assetType" TEXT NOT NULL DEFAULT 'stock',
    "isin" TEXT,
    "exchange" TEXT,
    "notes" TEXT,
    "lastUpdated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_StockPosition" ("avgCost", "currency", "currentPrice", "exchange", "fxToEur", "id", "lastUpdated", "name", "notes", "platform", "shares", "ticker") SELECT "avgCost", "currency", "currentPrice", "exchange", "fxToEur", "id", "lastUpdated", "name", "notes", "platform", "shares", "ticker" FROM "StockPosition";
DROP TABLE "StockPosition";
ALTER TABLE "new_StockPosition" RENAME TO "StockPosition";
CREATE INDEX "StockPosition_platform_idx" ON "StockPosition"("platform");
CREATE UNIQUE INDEX "StockPosition_platform_ticker_key" ON "StockPosition"("platform", "ticker");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "RealizedPnL_platform_dateSold_idx" ON "RealizedPnL"("platform", "dateSold");

-- CreateIndex
CREATE INDEX "RealizedPnL_ticker_idx" ON "RealizedPnL"("ticker");
