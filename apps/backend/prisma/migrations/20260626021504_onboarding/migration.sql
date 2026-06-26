-- CreateTable
CREATE TABLE "OnboardingApplication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "initialFundingMinor" INTEGER NOT NULL DEFAULT 0,
    "jointInviteEmail" TEXT,
    "consentAt" DATETIME NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "requestId" TEXT,
    "provisionedUserId" TEXT,
    "provisionedAccountId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OnboardingApplication_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "OperationsRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccountInvitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "inviteeEmail" TEXT NOT NULL,
    "relationship" TEXT NOT NULL DEFAULT 'joint',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "acceptedById" TEXT,
    "respondedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccountInvitation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AccountInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingApplication_reference_key" ON "OnboardingApplication"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingApplication_requestId_key" ON "OnboardingApplication"("requestId");

-- CreateIndex
CREATE INDEX "OnboardingApplication_status_idx" ON "OnboardingApplication"("status");

-- CreateIndex
CREATE INDEX "OnboardingApplication_email_idx" ON "OnboardingApplication"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AccountInvitation_token_key" ON "AccountInvitation"("token");

-- CreateIndex
CREATE INDEX "AccountInvitation_inviteeEmail_idx" ON "AccountInvitation"("inviteeEmail");

-- CreateIndex
CREATE INDEX "AccountInvitation_accountId_idx" ON "AccountInvitation"("accountId");
