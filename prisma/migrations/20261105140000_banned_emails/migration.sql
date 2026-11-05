-- Banned Google accounts as one-way e-mail hashes (audit 2026-11, A-01): a banned user may delete
-- the account, but the same account cannot sign up again.
CREATE TABLE "BannedEmail" (
    "emailHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BannedEmail_pkey" PRIMARY KEY ("emailHash")
);
