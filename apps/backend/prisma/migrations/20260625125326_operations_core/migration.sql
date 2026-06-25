-- CreateTable
CREATE TABLE "SimulatedEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channel" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'outbound',
    "kind" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "summary" TEXT NOT NULL,
    "detail" TEXT,
    "requestId" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SimulatedEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "OperationsRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OperationsRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "summary" TEXT NOT NULL,
    "detail" TEXT,
    "subjectName" TEXT,
    "subjectEmail" TEXT,
    "payload" TEXT,
    "lastAction" TEXT,
    "lastActorId" TEXT,
    "lastActorRole" TEXT,
    "lastActorName" TEXT,
    "lastActionNote" TEXT,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_OperationsRequest" ("createdAt", "id", "payload", "status", "summary", "type", "updatedAt") SELECT "createdAt", "id", "payload", "status", "summary", "type", "updatedAt" FROM "OperationsRequest";
DROP TABLE "OperationsRequest";
ALTER TABLE "new_OperationsRequest" RENAME TO "OperationsRequest";
CREATE INDEX "OperationsRequest_status_idx" ON "OperationsRequest"("status");
CREATE INDEX "OperationsRequest_type_idx" ON "OperationsRequest"("type");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SimulatedEvent_channel_idx" ON "SimulatedEvent"("channel");

-- CreateIndex
CREATE INDEX "SimulatedEvent_requestId_idx" ON "SimulatedEvent"("requestId");

-- CreateIndex
CREATE INDEX "SimulatedEvent_createdAt_idx" ON "SimulatedEvent"("createdAt");
