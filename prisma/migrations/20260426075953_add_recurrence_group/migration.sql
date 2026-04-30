-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "recurrenceGroupId" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_recurrenceGroupId_idx" ON "Transaction"("recurrenceGroupId");
