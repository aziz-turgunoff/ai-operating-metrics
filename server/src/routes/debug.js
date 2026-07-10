import { Router } from "express";
import { fetchWithTimeout } from "../lib/fetchWithTimeout.js";
import { LEADBANK_PROMPT, APOLLO_PROMPT } from "../connectors/companyai.js";
import { fetchOpenWebUI, monthWindow } from "../connectors/openwebui.js";

async function chatCompletion(prompt) {
  const path = process.env.OPENWEBUI_CHAT_COMPLETIONS_PATH || "/api/chat/completions";
  const r = await fetchWithTimeout(
    `${process.env.OPENWEBUI_URL}${path}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENWEBUI_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.OPENWEBUI_COMPANYAI_MODEL, messages: [{ role: "user", content: prompt }] }),
    },
    20000
  );
  return { status: r.status, body: await r.text() };
}

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
    const window = monthWindow();
    const [summaryRes, usersRes] = await Promise.all([
      fetchOpenWebUI("/api/v1/analytics/summary", window),
      fetchOpenWebUI("/api/v1/analytics/users", window),
    ]);
    res.json({
      window,
      summary: { status: summaryRes.status, body: await summaryRes.text() },
      users: { status: usersRes.status, body: await usersRes.text() },
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Dumps both raw model responses side by side — one per system — so a
// failure in one (e.g. Apollo) is never masked by the other succeeding.
debugRouter.get("/api/debug/companyai/raw", async (_req, res) => {
  if (!process.env.OPENWEBUI_TOKEN || !process.env.OPENWEBUI_URL) {
    return res.status(400).json({ error: "OPENWEBUI_URL / OPENWEBUI_TOKEN not set" });
  }
  if (!process.env.OPENWEBUI_COMPANYAI_MODEL) {
    return res.status(400).json({ error: "OPENWEBUI_COMPANYAI_MODEL not set" });
  }
  try {
    const [leadbank, apollo] = await Promise.all([
      chatCompletion(LEADBANK_PROMPT).catch((e) => ({ status: null, body: null, error: String(e) })),
      chatCompletion(APOLLO_PROMPT).catch((e) => ({ status: null, body: null, error: String(e) })),
    ]);
    res.json({
      leadbank: { query: LEADBANK_PROMPT, ...leadbank },
      apollo: { query: APOLLO_PROMPT, ...apollo },
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
