-- Panel invite links (docs/07 §7a): only the token's hash is stored.
-- CreateTable
CREATE TABLE "PanelInvite" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 30,
    "usesCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PanelInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PanelInviteUse" (
    "id" TEXT NOT NULL,
    "inviteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PanelInviteUse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PanelInvite_tokenHash_key" ON "PanelInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "PanelInvite_createdAt_idx" ON "PanelInvite"("createdAt");

-- CreateIndex
CREATE INDEX "PanelInviteUse_userId_idx" ON "PanelInviteUse"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PanelInviteUse_inviteId_userId_key" ON "PanelInviteUse"("inviteId", "userId");

-- AddForeignKey
ALTER TABLE "PanelInvite" ADD CONSTRAINT "PanelInvite_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanelInviteUse" ADD CONSTRAINT "PanelInviteUse_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "PanelInvite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanelInviteUse" ADD CONSTRAINT "PanelInviteUse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
