-- CreateTable
CREATE TABLE "CryptoPosition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "asset" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "eurValue" REAL NOT NULL,
    "source" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'Binance',
    "pricedVia" TEXT,
    "lastUpdated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "CryptoPosition_platform_idx" ON "CryptoPosition"("platform");

-- CreateIndex
CREATE UNIQUE INDEX "CryptoPosition_platform_source_asset_key" ON "CryptoPosition"("platform", "source", "asset");
