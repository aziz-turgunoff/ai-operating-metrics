import { Router } from "express";
import { prisma } from "../db.js";
import { SOURCES_META } from "../sources.js";

export const monthsRouter = Router();

// GET /api/months -> distinct months that have at least one snapshot, for a
// month-picker dropdown. The current calendar month is never served from
// here — the frontend always fetches that one live from /api/metrics.
monthsRouter.get("/api/months", async (_req, res) => {
  const rows = await prisma.snapshot.findMany({
    select: { month: true },
    distinct: ["month"],
    orderBy: { month: "desc" },
  });
  res.json({ months: rows.map((r) => r.month) });
});

// GET /api/months/:month/report -> reconstructs the report shape (northStar +
// categories) from the MOST RECENT snapshot taken in that month, so a past
// month renders through the exact same UI as a live /api/metrics response.
// Notes/errors aren't persisted per metric (only the source's status at
// capture time), so historical cards show numbers + status dots but no note text.
monthsRouter.get("/api/months/:month/report", async (req, res) => {
  const { month } = req.params;
  const snapshot = await prisma.snapshot.findFirst({
    where: { month },
    orderBy: { capturedAt: "desc" },
  });
  if (!snapshot) return res.status(404).json({ error: `No snapshot found for ${month}` });

  const rows = await prisma.metricValue.findMany({
    where: { snapshotId: snapshot.id },
    orderBy: { id: "asc" },
  });

  const toMetric = (r) => ({
    label: r.label,
    value: r.value ?? r.valueText ?? null,
    unit: r.unit ?? undefined,
    source: r.source,
  });

  const northStar = rows
    .filter((r) => r.category === "northStar")
    .map((r) => ({ key: r.metricKey, ...toMetric(r) }));

  const categoryNames = [...new Set(rows.filter((r) => r.category !== "northStar").map((r) => r.category))];
  const categories = categoryNames.map((name) => ({
    name,
    metrics: rows.filter((r) => r.category === name).map(toMetric),
  }));

  const sources = {};
  for (const r of rows) {
    if (!sources[r.source]) sources[r.source] = { status: r.sourceStatus };
  }

  res.json({
    month,
    generatedAt: snapshot.capturedAt,
    snapshotId: snapshot.id,
    sourcesMeta: SOURCES_META,
    sources,
    report: { northStar, categories },
  });
});
