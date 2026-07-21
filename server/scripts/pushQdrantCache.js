// Run this from a machine connected to the Outline VPN (the exit IP Sergey
// whitelisted on Qdrant) — Vercel's own egress isn't on that whitelist, so
// production reads Qdrant via the cache this script pushes instead of
// fetching it directly. See connectors/qdrant.js header for the full story.
//
// Usage: node scripts/pushQdrantCache.js
// Env: QDRANT_URL, QDRANT_API_KEY (to read Qdrant), QDRANT_PUSH_SECRET (to
// authenticate the push), QDRANT_PUSH_TARGET (defaults to the production API).
import "dotenv/config";
import { fetchQdrantDirect } from "../src/connectors/qdrant.js";

const TARGET = process.env.QDRANT_PUSH_TARGET || "https://ai-operating-metrics-api.vercel.app";

async function main() {
  if (!process.env.QDRANT_PUSH_SECRET) {
    throw new Error("QDRANT_PUSH_SECRET not set in server/.env");
  }
  const { note, ...data } = await fetchQdrantDirect();
  if (note) console.warn("[pushQdrantCache] note:", note);

  const r = await fetch(`${TARGET}/api/push/qdrant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.QDRANT_PUSH_SECRET}`,
    },
    body: JSON.stringify(data),
  });
  if (!r.ok) {
    throw new Error(`Push failed: HTTP ${r.status} ${await r.text().catch(() => "")}`);
  }
  const result = await r.json();
  console.log(`Pushed Qdrant cache to ${TARGET} — updatedAt ${result.updatedAt}`);
  console.log(`  companyPointsCount=${data.companyPointsCount} totalPointsCount=${data.totalPointsCount}`);
}

main().catch((e) => {
  console.error("[pushQdrantCache] failed:", e);
  process.exit(1);
});
