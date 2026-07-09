// Self-hosted Open WebUI analytics: active users, messages, tokens, chats,
// per-user + per-model tables, daily trend — scoped to the current calendar
// month (this API, unlike LeadBank, actually supports real date ranges).
//
// CONFIRMED 2026-07-10 against the live instance:
// - start_date/end_date are epoch SECONDS (integers), not date strings —
//   sending "YYYY-MM-DD" 422s, and sending epoch millis silently returns an
//   all-zero window (wrong magnitude, not an error).
// - GET /summary  -> { total_messages, total_chats, total_models, total_users }
//   NOTE: no token count here at all.
// - GET /users    -> { users: [{ user_id, name, email, count, input_tokens,
//   output_tokens, total_tokens }] } — "count" is message count.
// - GET /models   -> { models: [{ model_id, count }] } — no token count per model.
// - GET /daily    -> { data: [{ date, models: { modelName: count, ... } }] } —
//   grouped by model per day, not a flat messages/tokens row.
// Since /summary has no tokens field, `tokens` here is a derived sum of
// byUser[].tokens (from /users) — null if that call fails, not a guess.
//
// Auth: the instance sits behind a reverse proxy that sometimes consumes the
// Authorization header itself. If Bearer gets a 401, retry once with
// x-api-key before giving up — see fetchOpenWebUI(). (Bearer worked fine in
// testing; this is defensive for other environments/tokens.)
import { fetchWithRetry } from "../lib/fetchWithRetry.js";
import { num, pick } from "../lib/normalize.js";

const BASE_PATH = "/api/v1/analytics";
// /users and /daily scale with org user count and days-in-month respectively
// (see notes above) and all 4 endpoints run in parallel with an internal
// bearer -> x-api-key auth-fallback retry each, so the old default 10000ms
// per attempt left little headroom on a large org. Raised for real latency
// headroom; fetchWithRetry additionally covers one transient network/timeout
// retry on top of that (not an auth retry — that's handled separately below).
const TIMEOUT_MS = 15000;

export function monthWindow() {
  const now = new Date();
  const startOfMonthLocal = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  return {
    start_date: Math.floor(startOfMonthLocal.getTime() / 1000),
    end_date: Math.floor(now.getTime() / 1000),
  };
}

export async function fetchOpenWebUI(path, params = {}) {
  const url = new URL(`${process.env.OPENWEBUI_URL}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const bearer = await fetchWithRetry(
    url.toString(),
    { headers: { Authorization: `Bearer ${process.env.OPENWEBUI_TOKEN}` } },
    TIMEOUT_MS
  );
  if (bearer.status !== 401) return bearer;

  return fetchWithRetry(
    url.toString(),
    { headers: { "x-api-key": process.env.OPENWEBUI_TOKEN } },
    TIMEOUT_MS
  );
}

function normalizeSummary(json) {
  return {
    activeUsers: num(pick(json, ["total_users"])),
    messages: num(pick(json, ["total_messages"])),
    chats: num(pick(json, ["total_chats"])),
  };
}

function normalizeUsers(json) {
  const rows = pick(json, ["users"]) ?? [];
  return rows.map((u) => ({
    user: pick(u, ["name", "email"]),
    messages: num(pick(u, ["count"])),
    tokens: num(pick(u, ["total_tokens"])),
  }));
}

function normalizeModels(json) {
  const rows = pick(json, ["models"]) ?? [];
  return rows.map((m) => ({
    model: pick(m, ["model_id"]),
    messages: num(pick(m, ["count"])),
    tokens: null, // not exposed per-model
  }));
}

function normalizeDaily(json) {
  const rows = pick(json, ["data"]) ?? [];
  return rows.map((r) => {
    const perModel = r.models ?? {};
    const messages = Object.values(perModel).reduce((acc, n) => acc + (typeof n === "number" ? n : 0), 0);
    return { date: r.date, messages, tokens: null };
  });
}

export async function openwebui() {
  if (!process.env.OPENWEBUI_TOKEN || !process.env.OPENWEBUI_URL) {
    return { status: "pending", note: "OPENWEBUI_URL / OPENWEBUI_TOKEN not set" };
  }

  const window = monthWindow();
  try {
    const [summaryRes, usersRes, modelsRes, dailyRes] = await Promise.all([
      fetchOpenWebUI(`${BASE_PATH}/summary`, window),
      fetchOpenWebUI(`${BASE_PATH}/users`, window),
      fetchOpenWebUI(`${BASE_PATH}/models`, window),
      fetchOpenWebUI(`${BASE_PATH}/daily`, window),
    ]);

    if (!summaryRes.ok) {
      return {
        status: "error",
        error: `HTTP ${summaryRes.status} from /summary`,
        note: "Token set but the request failed — check the token/reverse-proxy auth, not silently falling back",
      };
    }

    const summary = normalizeSummary(await summaryRes.json());
    const byUser = usersRes.ok ? normalizeUsers(await usersRes.json()) : [];
    const byModel = modelsRes.ok ? normalizeModels(await modelsRes.json()) : [];
    const daily = dailyRes.ok ? normalizeDaily(await dailyRes.json()) : [];

    const tokens = usersRes.ok
      ? byUser.reduce((acc, u) => acc + (typeof u.tokens === "number" ? u.tokens : 0), 0)
      : null;

    const subFailures = [
      !usersRes.ok && `/users HTTP ${usersRes.status}`,
      !modelsRes.ok && `/models HTTP ${modelsRes.status}`,
      !dailyRes.ok && `/daily HTTP ${dailyRes.status}`,
    ].filter(Boolean);

    return {
      status: "live",
      data: { ...summary, tokens, byUser, byModel, daily },
      window,
      note: subFailures.length ? `Summary live; ${subFailures.join(", ")}` : null,
    };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}
