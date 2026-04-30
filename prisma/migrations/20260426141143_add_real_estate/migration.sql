-- CreateTable
CREATE TABLE "RealEstate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'apartment',
    "emoji" TEXT NOT NULL DEFAULT '🏠',
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "purchaseDate" DATETIME,
    "purchasePrice" REAL,
    "currentValue" REAL,
    "ownershipShare" REAL NOT NULL DEFAULT 1.0,
    "monthlyRent" REAL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "amount" REAL NOT NULL,
    "accountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "beneficiary" TEXT,
    "notes" TEXT,
    "isJoint" BOOLEAN NOT NULL DEFAULT false,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "transferGroupId" TEXT,
    "recurrenceGroupId" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT true,
    "estateId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "RealEstate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("accountId", "amount", "beneficiary", "categoryId", "confirmed", "createdAt", "date", "id", "isJoint", "month", "notes", "recurrenceGroupId", "transferGroupId", "updatedAt", "year") SELECT "accountId", "amount", "beneficiary", "categoryId", "confirmed", "createdAt", "date", "id", "isJoint", "month", "notes", "recurrenceGroupId", "transferGroupId", "updatedAt", "year" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");
CREATE INDEX "Transaction_year_month_idx" ON "Transaction"("year", "month");
CREATE INDEX "Transaction_accountId_idx" ON "Transaction"("accountId");
CREATE INDEX "Transaction_transferGroupId_idx" ON "Transaction"("transferGroupId");
CREATE INDEX "Transaction_categoryId_idx" ON "Transaction"("categoryId");
CREATE INDEX "Transaction_confirmed_idx" ON "Transaction"("confirmed");
CREATE INDEX "Transaction_recurrenceGroupId_idx" ON "Transaction"("recurrenceGroupId");
CREATE INDEX "Transaction_isJoint_idx" ON "Transaction"("isJoint");
CREATE INDEX "Transaction_estateId_idx" ON "Transaction"("estateId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
