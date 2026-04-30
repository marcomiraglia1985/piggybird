-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RealEstate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'apartment',
    "emoji" TEXT NOT NULL DEFAULT '🏠',
    "holding" TEXT NOT NULL DEFAULT 'owned',
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
INSERT INTO "new_RealEstate" ("active", "address", "city", "country", "createdAt", "currency", "currentValue", "displayOrder", "emoji", "id", "monthlyRent", "name", "notes", "ownershipShare", "purchaseDate", "purchasePrice", "type", "updatedAt") SELECT "active", "address", "city", "country", "createdAt", "currency", "currentValue", "displayOrder", "emoji", "id", "monthlyRent", "name", "notes", "ownershipShare", "purchaseDate", "purchasePrice", "type", "updatedAt" FROM "RealEstate";
DROP TABLE "RealEstate";
ALTER TABLE "new_RealEstate" RENAME TO "RealEstate";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
