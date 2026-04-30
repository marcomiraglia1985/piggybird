-- CreateTable
CREATE TABLE "CryptoTrade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "pricePerUnit" REAL NOT NULL,
    "pricePerUnitEur" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "totalEur" REAL NOT NULL,
    "date" DATETIME NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "notes" TEXT,
    "txId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "CryptoTrade_platform_asset_idx" ON "CryptoTrade"("platform", "asset");

-- CreateIndex
CREATE INDEX "CryptoTrade_date_idx" ON "CryptoTrade"("date");
