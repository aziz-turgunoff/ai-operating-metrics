import { Router } from "express";
import { gatherSources } from "../gather.js";
import { buildReport } from "../metrics.js";
import { SOURCES_META } from "../sources.js";

export const metricsRouter = Router();

function logSourceStatuses(results) {
  const line = Object.entries(results)
    .filter(([key]) => key in SOURCES_META)
    .map(([key, r]) => `${key}=${r.status}${r.degraded ? "(degraded)" : ""}`)
    .join(" ");
  console.log(`[metrics] ${new Date().toISOString()} ${line}`);
}

// Read-only — does not persist. Use POST /api/snapshot to record history.
metricsRouter.get("/api/metrics", async (_req, res) => {
  const results = await gatherSources();
  logSourceStatuses(results);
  const report = buildReport(results);
  res.json({
    generatedAt: new Date().toISOString(),
    month: new Date().toISOString().slice(0, 7),
    sourcesMeta: SOURCES_META,
    sources: {
      openrouter: results.openrouter, openwebui: results.openwebui,
      leadbank: results.leadbank, apollo: results.apollo,
      qdrant: results.qdrant, fireflies: results.fireflies,
      cicd: results.cicd, workflows: results.workflows,
      derived: results.derived, companyai: results.companyai,
    },
    report,
  });
});
