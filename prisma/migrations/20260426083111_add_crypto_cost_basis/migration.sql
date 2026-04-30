-- CreateTable
CREATE TABLE "CryptoCostBasis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "costEur" REAL NOT NULL,
    "notes" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "CryptoCostBasis_platform_idx" ON "CryptoCostBasis"("platform");

-- CreateIndex
CREATE UNIQUE INDEX "CryptoCostBasis_platform_asset_key" ON "CryptoCostBasis"("platform", "asset");
