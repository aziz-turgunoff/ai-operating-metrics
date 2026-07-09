import { Router } from "express";
import { fetchWithTimeout } from "../lib/fetchWithTimeout.js";
import { COMPANYAI_PROMPT } from "../connectors/companyai.js";

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

debugRouter.get("/api/debug/openwebui/analytics", async (_req, res) => {
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

debugRouter.get("/api/debug/companyai/raw", async (_req, res) => {
  if (!process.env.OPENWEBUI_TOKEN || !process.env.OPENWEBUI_URL) {
    return res.status(400).json({ error: "OPENWEBUI_URL / OPENWEBUI_TOKEN not set" });
  }
  if (!process.env.OPENWEBUI_COMPANYAI_MODEL) {
    return res.status(400).json({ error: "OPENWEBUI_COMPANYAI_MODEL not set" });
  }
  try {
    const path = process.env.OPENWEBUI_CHAT_COMPLETIONS_PATH || "/api/chat/completions";
    const r = await fetchWithTimeout(
      `${process.env.OPENWEBUI_URL}${path}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENWEBUI_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OPENWEBUI_COMPANYAI_MODEL,
          messages: [{ role: "user", content: COMPANYAI_PROMPT }],
        }),
      },
      20000
    );
    const text = await r.text();
    res.status(r.status).type("application/json").send(text);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
