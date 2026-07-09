import { prisma } from "./db.js";
import { gatherSources } from "./gather.js";
import { buildReport } from "./metrics.js";

// Shared by POST /api/snapshot and the monthly cron — one place that fetches
// every source, derives the report, and persists both the raw payload and a
// normalized row per metric so history can be queried without parsing JSON.
export async function runSnapshot() {
  const results = await gatherSources();
  const report = buildReport(results);
  const month = new Date().toISOString().slice(0, 7);

  const snapshot = await prisma.snapshot.create({
    data: {
      month,
      raw: JSON.stringify(results),
    },
  });

  const rows = [];
  for (const m of report.northStar) {
    rows.push({
      snapshotId: snapshot.id, category: "northStar", metricKey: m.key, label: m.label,
      value: typeof m.value === "number" ? m.value : null,
      valueText: typeof m.value === "string" ? m.value : null,
      unit: m.unit ?? null, source: m.source,
      sourceStatus: results[m.source]?.status ?? "mock",
    });
  }
  for (const cat of report.categories) {
    for (const m of cat.metrics) {
      rows.push({
        snapshotId: snapshot.id, category: cat.name, metricKey: m.label, label: m.label,
        value: typeof m.value === "number" ? m.value : null,
        valueText: typeof m.value === "string" ? m.value : null,
        unit: m.unit ?? null, source: m.source,
        sourceStatus: results[m.source]?.status ?? "mock",
      });
    }
  }
  await prisma.metricValue.createMany({ data: rows });

  return { month, snapshotId: snapshot.id, report, generatedAt: snapshot.capturedAt };
}
