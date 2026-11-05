-- The minimal error log (docs/02 Observability): no personal data, cleaned after 30 days.
-- CreateTable
CREATE TABLE "ServerError" (
    "id" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "digest" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerError_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServerError_createdAt_idx" ON "ServerError"("createdAt");
