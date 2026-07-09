import { Router } from "express";
import { fetchWithTimeout } from "../lib/fetchWithTimeout.js";

// Dev-only: returns the RAW response straight from the source, before any
// normalization — used to confirm real field names when wiring a new
// connector. Gated on the same env vars the real connector needs; never
// fabricates a response when credentials are missing.
export const debugRouter = Router();

debugRouter.get("/api/debug/openrouter/auth-key", async (_req, res) => {
  if (!process.env.OPENROUTER_KEY) return res.status(400).json({ error: "OPENROUTER_KEY not set" });
  try {
    const r = await fetchWithTimeout("https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_KEY}` },
    });
    const text = await r.text();
    res.status(r.status).type("application/json").send(text);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

debugRouter.get("/api/debug/openrouter/activity", async (_req, res) => {
  if (!process.env.OPENROUTER_MGMT_KEY) return res.status(400).json({ error: "OPENROUTER_MGMT_KEY not set" });
  try {
    const r = await fetchWithTimeout("https://openrouter.ai/api/v1/activity", {
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_MGMT_KEY}` },
    });
    const text = await r.text();
    res.status(r.status).type("application/json").send(text);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

debugRouter.get("/api/debug/openwebui", async (_req, res) => {
  if (!process.env.OPENWEBUI_TOKEN || !process.env.OPENWEBUI_URL) {
    return res.status(400).json({ error: "OPENWEBUI_URL / OPENWEBUI_TOKEN not set" });
  }
  try {
    const path = process.env.OPENWEBUI_ANALYTICS_PATH || "/api/v1/analytics";
    const r = await fetchWithTimeout(`${process.env.OPENWEBUI_URL}${path}`, {
      headers: { Authorization: `Bearer ${process.env.OPENWEBUI_TOKEN}` },
    });
    const text = await r.text();
    res.status(r.status).type("application/json").send(text);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
