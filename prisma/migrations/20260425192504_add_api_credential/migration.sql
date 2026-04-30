-- CreateTable
CREATE TABLE "ApiCredential" (
    "provider" TEXT NOT NULL PRIMARY KEY,
    "apiKey" TEXT NOT NULL,
    "apiSecret" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "hint" TEXT,
    "lastSyncAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
