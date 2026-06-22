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
CREATE TABLE "Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticker" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "exchange" TEXT,
    "sector" TEXT,
    "industry" TEXT,
    "country" TEXT,
    "cik" TEXT,
    "description" TEXT,
    "lastRefreshedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SecurityQuote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "asOf" DATETIME NOT NULL,
    "price" REAL,
    "marketCap" REAL,
    "enterpriseValue" REAL,
    "sourceKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SecurityQuote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinancialSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "periodType" TEXT NOT NULL,
    "fiscalDate" DATETIME NOT NULL,
    "revenue" REAL,
    "grossProfit" REAL,
    "opIncome" REAL,
    "ebitda" REAL,
    "netIncome" REAL,
    "ocf" REAL,
    "capex" REAL,
    "fcf" REAL,
    "totalDebt" REAL,
    "cash" REAL,
    "shares" REAL,
    "sourceKey" TEXT,
    "reliability" TEXT NOT NULL DEFAULT 'REPORTED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinancialSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DerivedMetrics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "asOf" DATETIME NOT NULL,
    "metricsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DerivedMetrics_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "subjectRef" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "depth" TEXT NOT NULL DEFAULT 'STANDARD',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "companyId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Analysis_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Thesis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT NOT NULL,
    "userThesisText" TEXT NOT NULL,
    "coreBet" TEXT,
    "mustBeTrueJson" TEXT NOT NULL DEFAULT '[]',
    "entryPrice" REAL,
    "timeHorizon" TEXT,
    "convictionLevel" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Thesis_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Memo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "rating" TEXT,
    "positionSizeLow" REAL,
    "positionSizeHigh" REAL,
    "confidence" TEXT,
    "timeHorizon" TEXT,
    "modelUsed" TEXT,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemoSection_memoId_fkey" FOREIGN KEY ("memoId") REFERENCES "Memo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Score" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memoId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "value" INTEGER,
    "letter" TEXT,
    "rationaleMd" TEXT,
    "dataCompleteness" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "evidenceJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Score_memoId_fkey" FOREIGN KEY ("memoId") REFERENCES "Memo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT,
    "kind" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "mimeType" TEXT,
    "byteSize" INTEGER,
    "extractionStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Source_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SourceChunk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "page" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SourceChunk_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Citation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memoSectionId" TEXT NOT NULL,
    "sourceChunkId" TEXT,
    "dataPointRef" TEXT,
    "quote" TEXT,
    "locator" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Citation_memoSectionId_fkey" FOREIGN KEY ("memoSectionId") REFERENCES "MemoSection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Citation_sourceChunkId_fkey" FOREIGN KEY ("sourceChunkId") REFERENCES "SourceChunk" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PortfolioHolding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticker" TEXT NOT NULL,
    "name" TEXT,
    "sector" TEXT,
    "themesJson" TEXT NOT NULL DEFAULT '[]',
    "geography" TEXT,
    "factorsJson" TEXT NOT NULL DEFAULT '[]',
    "shares" REAL,
    "costBasis" REAL,
    "currentValue" REAL,
    "weightPct" REAL,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ThesisUpdate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT NOT NULL,
    "priceAtUpdate" REAL,
    "assumptionsChangedJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'INTACT',
    CONSTRAINT "ThesisUpdate_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "currentStatus" TEXT NOT NULL DEFAULT 'OPEN',
    "lastChecked" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChecklistItem_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "currentStep" TEXT,
    "logJson" TEXT NOT NULL DEFAULT '[]',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Job_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderConfig_providerKey_key" ON "ProviderConfig"("providerKey");

-- CreateIndex
CREATE UNIQUE INDEX "Company_ticker_key" ON "Company"("ticker");

-- CreateIndex
CREATE INDEX "SecurityQuote_companyId_asOf_idx" ON "SecurityQuote"("companyId", "asOf");

-- CreateIndex
CREATE INDEX "FinancialSnapshot_companyId_fiscalDate_idx" ON "FinancialSnapshot"("companyId", "fiscalDate");

-- CreateIndex
CREATE INDEX "DerivedMetrics_companyId_asOf_idx" ON "DerivedMetrics"("companyId", "asOf");

-- CreateIndex
CREATE UNIQUE INDEX "Thesis_analysisId_key" ON "Thesis"("analysisId");

-- CreateIndex
CREATE INDEX "Memo_analysisId_version_idx" ON "Memo"("analysisId", "version");

-- CreateIndex
CREATE INDEX "MemoSection_memoId_idx" ON "MemoSection"("memoId");

-- CreateIndex
CREATE INDEX "Score_memoId_idx" ON "Score"("memoId");

-- CreateIndex
CREATE INDEX "Source_analysisId_idx" ON "Source"("analysisId");

-- CreateIndex
CREATE INDEX "SourceChunk_sourceId_idx" ON "SourceChunk"("sourceId");

-- CreateIndex
CREATE INDEX "Citation_memoSectionId_idx" ON "Citation"("memoSectionId");

-- CreateIndex
CREATE INDEX "ThesisUpdate_analysisId_idx" ON "ThesisUpdate"("analysisId");

-- CreateIndex
CREATE INDEX "ChecklistItem_analysisId_idx" ON "ChecklistItem"("analysisId");

-- CreateIndex
CREATE UNIQUE INDEX "DataCache_providerKey_endpoint_paramsHash_key" ON "DataCache"("providerKey", "endpoint", "paramsHash");
