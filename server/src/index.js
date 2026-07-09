// Local dev entry only. Production (Vercel) uses api/index.js instead —
// serverless functions can't keep a node-cron timer alive between requests,
// so that path relies on a Vercel Cron Job hitting /api/cron/snapshot instead.
import { app } from "./app.js";
import { startScheduler } from "./scheduler.js";

startScheduler();

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`AI Operating Metrics API on :${PORT}`));
