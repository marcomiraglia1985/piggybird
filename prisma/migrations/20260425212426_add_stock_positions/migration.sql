-- CreateTable
CREATE TABLE "StockPosition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticker" TEXT NOT NULL,
    "name" TEXT,
    "shares" REAL NOT NULL,
    "avgCost" REAL,
    "currentPrice" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "fxToEur" REAL NOT NULL DEFAULT 1.0,
    "platform" TEXT NOT NULL DEFAULT 'Revolut',
    "exchange" TEXT,
    "notes" TEXT,
    "lastUpdated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "StockPosition_platform_idx" ON "StockPosition"("platform");

-- CreateIndex
CREATE UNIQUE INDEX "StockPosition_platform_ticker_key" ON "StockPosition"("platform", "ticker");
