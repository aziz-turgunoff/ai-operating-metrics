import express from "express";
import cors from "cors";
import "dotenv/config";
import { metricsRouter } from "./routes/metrics.js";
import { snapshotRouter } from "./routes/snapshot.js";
import { historyRouter } from "./routes/history.js";
import { startScheduler } from "./scheduler.js";

const app = express();
app.use(cors());
app.use(express.json());

app.use(metricsRouter);
app.use(snapshotRouter);
app.use(historyRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

startScheduler();

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`AI Operating Metrics API on :${PORT}`));
