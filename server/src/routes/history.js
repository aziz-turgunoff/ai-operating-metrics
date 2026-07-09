import { Router } from "express";
import { prisma } from "../db.js";

export const historyRouter = Router();

// GET /api/history?metricKey=hours_saved -> time series for one metric
// GET /api/history -> list of past snapshot months (for a month picker)
historyRouter.get("/api/history", async (req, res) => {
  const { metricKey } = req.query;
  if (!metricKey) {
    const snapshots = await prisma.snapshot.findMany({
      orderBy: { capturedAt: "desc" },
      select: { id: true, month: true, capturedAt: true },
    });
    return res.json({ snapshots });
  }

  const rows = await prisma.metricValue.findMany({
    where: { metricKey: String(metricKey) },
    include: { snapshot: { select: { month: true, capturedAt: true } } },
    orderBy: { snapshotId: "asc" },
  });

  res.json({
    metricKey,
    points: rows.map((r) => ({
      month: r.snapshot.month,
      capturedAt: r.snapshot.capturedAt,
      value: r.value ?? r.valueText,
      sourceStatus: r.sourceStatus,
    })),
  });
});
