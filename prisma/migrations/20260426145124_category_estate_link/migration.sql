-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emoji" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "color" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "estateId" TEXT,
    CONSTRAINT "Category_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "RealEstate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Category" ("active", "color", "displayOrder", "emoji", "group", "id", "name", "type") SELECT "active", "color", "displayOrder", "emoji", "group", "id", "name", "type" FROM "Category";
DROP TABLE "Category";
ALTER TABLE "new_Category" RENAME TO "Category";
CREATE INDEX "Category_estateId_idx" ON "Category"("estateId");
CREATE UNIQUE INDEX "Category_emoji_name_key" ON "Category"("emoji", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
