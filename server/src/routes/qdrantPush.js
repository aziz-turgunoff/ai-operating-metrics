import { Router } from "express";
import { prisma } from "../db.js";
import { CACHE_KEY } from "../connectors/qdrant.js";

export const qdrantPushRouter = Router();

// Vercel's egress IP isn't on Qdrant's whitelist (only a static VPN exit IP
// is — see connectors/qdrant.js header), so this lets a VPN-connected local
// machine push a fresh reading in instead. Bearer-token protected the same
// way /api/cron/snapshot is, just with its own secret so rotating one never
// affects the other.
qdrantPushRouter.post("/api/push/qdrant", async (req, res) => {
  if (!process.env.QDRANT_PUSH_SECRET) {
    return res.status(503).json({ error: "QDRANT_PUSH_SECRET not configured" });
  }
  if (req.headers.authorization !== `Bearer ${process.env.QDRANT_PUSH_SECRET}`) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const { collections, companyPointsCount, slackMessagesIndexed, meetingsIngested, totalPointsCount } = req.body ?? {};
  if (!Array.isArray(collections) || typeof totalPointsCount !== "number") {
    return res.status(400).json({ error: "expected { collections: [...], companyPointsCount, slackMessagesIndexed, meetingsIngested, totalPointsCount }" });
  }
  const data = { collections, companyPointsCount, slackMessagesIndexed, meetingsIngested, totalPointsCount };
  try {
    const row = await prisma.sourceCache.upsert({
      where: { sourceKey: CACHE_KEY },
      create: { sourceKey: CACHE_KEY, data: JSON.stringify(data) },
      update: { data: JSON.stringify(data) },
    });
    res.json({ ok: true, updatedAt: row.updatedAt });
  } catch (e) {
    // Without this, an unhandled rejection here (e.g. a stale Prisma Client
    // missing this model after a cached Vercel build skipped `prisma
    // generate`) leaves the request hanging with no response until Vercel's
    // function timeout — a 504 with zero diagnostic info. Surface it instead.
    res.status(500).json({ ok: false, error: String(e) });
  }
});
