-- CreateTable
CREATE TABLE "SourceCache" (
    "id" SERIAL NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SourceCache_sourceKey_key" ON "SourceCache"("sourceKey");
