-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Investment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "currentValue" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "lastUpdated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT
);
INSERT INTO "new_Investment" ("currency", "currentValue", "id", "lastUpdated", "name", "notes", "platform", "type") SELECT "currency", "currentValue", "id", "lastUpdated", "name", "notes", "platform", "type" FROM "Investment";
DROP TABLE "Investment";
ALTER TABLE "new_Investment" RENAME TO "Investment";
CREATE UNIQUE INDEX "Investment_name_key" ON "Investment"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
