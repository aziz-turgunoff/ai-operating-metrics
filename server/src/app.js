// The Express app itself, with no .listen() and no scheduler side effects —
// shared between local dev (src/index.js) and the Vercel serverless entry
// (api/index.js). Keeping route registration in exactly one place means the
// two entrypoints can never drift apart.
import express from "express";
import cors from "cors";
import "dotenv/config";
import { metricsRouter } from "./routes/metrics.js";
import { snapshotRouter } from "./routes/snapshot.js";
import { historyRouter } from "./routes/history.js";
import { monthsRouter } from "./routes/months.js";
import { debugRouter } from "./routes/debug.js";
import { cronRouter } from "./routes/cron.js";
import { qdrantPushRouter } from "./routes/qdrantPush.js";

export const app = express();
app.use(cors());
app.use(express.json());

app.use(metricsRouter);
app.use(snapshotRouter);
app.use(historyRouter);
app.use(monthsRouter);
app.use(debugRouter);
app.use(cronRouter);
app.use(qdrantPushRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));
