-- CreateTable
CREATE TABLE "TradingCash" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL DEFAULT 'Revolut',
    "currency" TEXT NOT NULL,
    "amount" REAL NOT NULL DEFAULT 0,
    "fxToEur" REAL NOT NULL DEFAULT 1.0,
    "lastUpdated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "TradingCash_platform_currency_key" ON "TradingCash"("platform", "currency");
