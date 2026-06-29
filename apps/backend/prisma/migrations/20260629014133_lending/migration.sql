-- AlterTable
ALTER TABLE "Account" ADD COLUMN "interestAccruedThrough" DATETIME;

-- CreateTable
CREATE TABLE "LendingProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "principalMinor" INTEGER NOT NULL,
    "apyBps" INTEGER NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "paymentMinor" INTEGER,
    "openedAt" DATETIME NOT NULL,
    "maturesAt" DATETIME NOT NULL,
    "lastAccruedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LendingProduct_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "LendingProduct_accountId_key" ON "LendingProduct"("accountId");

-- CreateIndex
CREATE INDEX "LendingProduct_status_idx" ON "LendingProduct"("status");

-- CreateIndex
CREATE INDEX "LendingProduct_kind_idx" ON "LendingProduct"("kind");
