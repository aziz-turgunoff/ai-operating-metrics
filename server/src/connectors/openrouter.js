// LLM gateway usage: split across two OpenRouter keys.
// - OPENROUTER_KEY      -> GET /api/v1/auth/key  (per-key totals + credit balance; any key works)
// - OPENROUTER_MGMT_KEY -> GET /api/v1/activity   (per-model daily activity; ORG MANAGEMENT KEY REQUIRED)
//
// /activity returns daily rows for the last 30 COMPLETED UTC days — a rolling
// window, NOT the calendar month, and it excludes the current UTC day. We sum
// whatever it returns and surface that as a caveat rather than pretend it's
// month-to-date.
import { fetchWithTimeout } from "../lib/fetchWithTimeout.js";
import { num, pick } from "../lib/normalize.js";

function normalizeAuthKey(json) {
  const usage = num(pick(json, ["data.usage", "usage"]));
  const limit = num(pick(json, ["data.limit", "limit"]));
  return {
    usage,
    limit,
    creditBalance: usage != null && limit != null ? limit - usage : null,
  };
}

function normalizeActivity(json) {
  const rows = Array.isArray(json) ? json : pick(json, ["data", "rows", "activity"]) ?? [];
  let tokens = 0, spend = 0, requests = 0;
  const byModel = new Map();

  for (const row of rows) {
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
  }

  return {
    tokens, spend, requests,
    byModel: [...byModel.entries()].map(([model, tokens]) => ({ model, tokens })),
    rowCount: rows.length,
  };
}

export async function openrouter() {
  if (!process.env.OPENROUTER_KEY) return { status: "pending", note: "OPENROUTER_KEY not set" };

  let authTotals;
  try {
    const r = await fetchWithTimeout("https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_KEY}` },
    });
    if (!r.ok) return { status: "error", error: `HTTP ${r.status} from /auth/key` };
    authTotals = normalizeAuthKey(await r.json());
  } catch (e) {
    return { status: "error", error: String(e) };
  }

  if (!process.env.OPENROUTER_MGMT_KEY) {
    return {
      status: "live",
      data: {
        usage: authTotals.usage,
        limit: authTotals.limit,
        creditBalance: authTotals.creditBalance,
        spend: authTotals.usage, // best spend figure available without a management key
        tokens: null,
        requests: null,
        byModel: [],
        analyticsStatus: "pending",
      },
      note: "Per-model breakdown pending: management key needed for analytics. \"Total spend\" here is lifetime usage on this key from /auth/key, not month-to-date.",
    };
  }

  try {
    const r = await fetchWithTimeout("https://openrouter.ai/api/v1/activity", {
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_MGMT_KEY}` },
    });
    if (!r.ok) {
      return {
        status: "live",
        data: { ...authTotals, spend: authTotals.usage, tokens: null, requests: null, byModel: [], analyticsStatus: "error" },
        note: `Activity fetch failed (HTTP ${r.status}) — falling back to /auth/key totals only`,
      };
    }
    const activity = normalizeActivity(await r.json());
    return {
      status: "live",
      data: {
        usage: authTotals.usage,
        limit: authTotals.limit,
        creditBalance: authTotals.creditBalance,
        tokens: activity.tokens,
        spend: activity.spend,
        requests: activity.requests,
        byModel: activity.byModel,
        analyticsStatus: "live",
      },
      note: "Rolling 30-day window from /activity, not the calendar month — and it excludes the current UTC day",
    };
  } catch (e) {
    return {
      status: "live",
      data: { ...authTotals, spend: authTotals.usage, tokens: null, requests: null, byModel: [], analyticsStatus: "error" },
      note: `Activity fetch failed (${String(e)}) — falling back to /auth/key totals only`,
    };
  }
}
