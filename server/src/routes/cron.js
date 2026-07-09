import { Router } from "express";
import { runSnapshot } from "../runSnapshot.js";

export const cronRouter = Router();

// Vercel Cron Jobs only ever send a GET request, and only to a path
// configured in vercel.json's `crons` — so this is a separate route from the
// manual POST /api/snapshot the dashboard's "Save snapshot now" button hits.
//
// Vercel automatically attaches `Authorization: Bearer <CRON_SECRET>` when it
// invokes a scheduled job, IF you've set CRON_SECRET yourself as an env var —
// checking it here stops anyone else from hitting this URL to spam snapshots.
cronRouter.get("/api/cron/snapshot", async (req, res) => {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "unauthorized" });
  }
  try {
    const result = await runSnapshot();
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});
