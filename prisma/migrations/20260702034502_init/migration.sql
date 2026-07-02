-- CreateTable
CREATE TABLE "ProviderConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "encryptedApiKey" TEXT,
    "settingsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "valueJson" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "subjectRef" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "depth" TEXT NOT NULL DEFAULT 'STANDARD',
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Thesis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT NOT NULL,
    "userThesisText" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Thesis_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Memo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "rating" TEXT,
    "confidence" TEXT,
    "timeHorizon" TEXT,
    "positionSizeLow" REAL,
    "positionSizeHigh" REAL,
    "sizingRationale" TEXT,
    "modelUsed" TEXT,
    "providerKey" TEXT,
    "compositeScore" INTEGER,
    "totalUnverified" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" REAL,
    "actualCostUsd" REAL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "markdownCache" TEXT,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Memo_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MemoSection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memoId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "ordering" INTEGER NOT NULL DEFAULT 0,
    "contentMd" TEXT NOT NULL,
    "auditJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemoSection_memoId_fkey" FOREIGN KEY ("memoId") REFERENCES "Memo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Score" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memoId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "letter" TEXT NOT NULL,
    "rationaleMd" TEXT,
    "dataCompleteness" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "evidenceJson" TEXT NOT NULL DEFAULT '[]',
    "signalsJson" TEXT NOT NULL DEFAULT '[]',
    "needsQualitative" BOOLEAN NOT NULL DEFAULT false,
    "clamped" BOOLEAN NOT NULL DEFAULT false,
    "comparative" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Score_memoId_fkey" FOREIGN KEY ("memoId") REFERENCES "Memo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reconciliation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticker" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "fiscalDate" TEXT NOT NULL,
    "chosenProvider" TEXT NOT NULL,
    "chosenValue" REAL NOT NULL,
    "otherProvider" TEXT NOT NULL,
    "otherValue" REAL NOT NULL,
    "pctDiff" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DataCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerKey" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "paramsHash" TEXT NOT NULL,
    "responseJson" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ttlSeconds" INTEGER NOT NULL DEFAULT 3600
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "analysisId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "currentStep" TEXT,
    "estimatedCostUsd" REAL,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Job_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderConfig_providerKey_key" ON "ProviderConfig"("providerKey");

-- CreateIndex
CREATE UNIQUE INDEX "Thesis_analysisId_key" ON "Thesis"("analysisId");

-- CreateIndex
CREATE INDEX "Memo_analysisId_version_idx" ON "Memo"("analysisId", "version");

-- CreateIndex
CREATE INDEX "MemoSection_memoId_idx" ON "MemoSection"("memoId");

-- CreateIndex
CREATE INDEX "Score_memoId_idx" ON "Score"("memoId");

-- CreateIndex
CREATE INDEX "Reconciliation_ticker_fiscalDate_idx" ON "Reconciliation"("ticker", "fiscalDate");

-- CreateIndex
CREATE UNIQUE INDEX "DataCache_providerKey_endpoint_paramsHash_key" ON "DataCache"("providerKey", "endpoint", "paramsHash");
