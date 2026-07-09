// LLM gateway usage: tokens, spend, requests, per-model + per-app breakdown.
// Field names below are best-guess against OpenRouter's Activity export shape
// (date, model, usage, requests, prompt_tokens, completion_tokens) — the
// normalizer is deliberately defensive (multiple candidate keys) so it degrades
// to nulls instead of throwing if the real shape differs once a key is set.
import { fetchWithTimeout } from "../lib/fetchWithTimeout.js";
import { num, pick } from "../lib/normalize.js";

function rowsOf(json) {
  return Array.isArray(json) ? json : pick(json, ["data", "rows", "activity"]) ?? [];
}

function inCurrentMonth(row) {
  const month = new Date().toISOString().slice(0, 7);
  const date = pick(row, ["date", "created_at", "day"]);
  return typeof date === "string" && date.startsWith(month);
}

function normalize(json) {
  const all = rowsOf(json);
  const rows = all.filter(inCurrentMonth);
  const scoped = rows.length ? rows : all; // fall back to whatever the API already scoped for us

  let tokens = 0, spend = 0, requests = 0;
  const byModel = new Map();
  const byApp = new Map();

  for (const row of scoped) {
    const promptTok = num(pick(row, ["prompt_tokens"])) ?? 0;
    const completionTok = num(pick(row, ["completion_tokens"])) ?? 0;
    const rowTokens = num(pick(row, ["tokens", "total_tokens"])) ?? promptTok + completionTok;
    const rowSpend = num(pick(row, ["usage", "spend", "cost", "total_cost"])) ?? 0;
    const rowRequests = num(pick(row, ["requests", "request_count"])) ?? 0;

    tokens += rowTokens;
    spend += rowSpend;
    requests += rowRequests;

    const model = pick(row, ["model", "model_permaslug"]);
    if (model) byModel.set(model, (byModel.get(model) ?? 0) + rowTokens);

    const app = pick(row, ["app", "app_id", "title", "referer"]);
    if (app) byApp.set(app, (byApp.get(app) ?? 0) + rowTokens);
  }

  return {
    tokens, spend, requests,
    byModel: [...byModel.entries()].map(([model, tokens]) => ({ model, tokens })),
    byApp: [...byApp.entries()].map(([app, tokens]) => ({ app, tokens })),
  };
}

export async function openrouter() {
  if (!process.env.OPENROUTER_KEY) return { status: "pending", note: "OPENROUTER_KEY not set" };
  try {
    const r = await fetchWithTimeout("https://openrouter.ai/api/v1/activity", {
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_KEY}` },
    });
    if (!r.ok) return { status: "error", error: `HTTP ${r.status}` };
    const json = await r.json();
    return {
      status: "live",
      data: normalize(json),
      note: "Field mapping is best-guess against OpenRouter's documented Activity shape — confirm against a real response and adjust normalize() in this file if field names differ",
    };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}
