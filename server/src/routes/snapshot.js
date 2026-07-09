import { Router } from "express";
import { runSnapshot } from "../runSnapshot.js";

export const snapshotRouter = Router();

// Call this from the cron (see scheduler.js) or manually to persist a
// point-in-time snapshot for month-over-month history.
snapshotRouter.post("/api/snapshot", async (_req, res) => {
  try {
    const result = await runSnapshot();
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});
