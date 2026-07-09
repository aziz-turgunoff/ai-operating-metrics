-- CreateTable
CREATE TABLE "Snapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "month" TEXT NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "MetricValue" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "snapshotId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" REAL,
    "valueText" TEXT,
    "unit" TEXT,
    "source" TEXT NOT NULL,
    "sourceStatus" TEXT NOT NULL,
    CONSTRAINT "MetricValue_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MetricValue_metricKey_snapshotId_idx" ON "MetricValue"("metricKey", "snapshotId");
