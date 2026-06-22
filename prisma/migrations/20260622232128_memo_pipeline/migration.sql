-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Memo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "rating" TEXT,
    "positionSizeLow" REAL,
    "positionSizeHigh" REAL,
    "confidence" TEXT,
    "timeHorizon" TEXT,
    "modelUsed" TEXT,
    "providerKey" TEXT,
    "compositeScore" INTEGER,
    "totalUnverified" INTEGER NOT NULL DEFAULT 0,
    "markdownCache" TEXT,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Memo_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Memo" ("analysisId", "confidence", "generatedAt", "id", "markdownCache", "modelUsed", "positionSizeHigh", "positionSizeLow", "rating", "timeHorizon", "version") SELECT "analysisId", "confidence", "generatedAt", "id", "markdownCache", "modelUsed", "positionSizeHigh", "positionSizeLow", "rating", "timeHorizon", "version" FROM "Memo";
DROP TABLE "Memo";
ALTER TABLE "new_Memo" RENAME TO "Memo";
CREATE INDEX "Memo_analysisId_version_idx" ON "Memo"("analysisId", "version");
CREATE TABLE "new_MemoSection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memoId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "ordering" INTEGER NOT NULL DEFAULT 0,
    "contentMd" TEXT NOT NULL,
    "auditJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemoSection_memoId_fkey" FOREIGN KEY ("memoId") REFERENCES "Memo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MemoSection" ("contentMd", "createdAt", "id", "key", "memoId", "ordering") SELECT "contentMd", "createdAt", "id", "key", "memoId", "ordering" FROM "MemoSection";
DROP TABLE "MemoSection";
ALTER TABLE "new_MemoSection" RENAME TO "MemoSection";
CREATE INDEX "MemoSection_memoId_idx" ON "MemoSection"("memoId");
CREATE TABLE "new_Score" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memoId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "value" INTEGER,
    "letter" TEXT,
    "rationaleMd" TEXT,
    "dataCompleteness" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "evidenceJson" TEXT NOT NULL DEFAULT '[]',
    "signalsJson" TEXT NOT NULL DEFAULT '[]',
    "needsQualitative" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Score_memoId_fkey" FOREIGN KEY ("memoId") REFERENCES "Memo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Score" ("category", "createdAt", "dataCompleteness", "evidenceJson", "id", "letter", "memoId", "rationaleMd", "value") SELECT "category", "createdAt", "dataCompleteness", "evidenceJson", "id", "letter", "memoId", "rationaleMd", "value" FROM "Score";
DROP TABLE "Score";
ALTER TABLE "new_Score" RENAME TO "Score";
CREATE INDEX "Score_memoId_idx" ON "Score"("memoId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
