// TEMPORARY fallback: asks the Home Alliance AI (via Open WebUI chat
// completions) to report LeadBank + Apollo numbers using its own tools, for
// when we don't yet have direct API keys for those systems.
//
// THIS IS NOT A VERIFIED SOURCE. It's an LLM reading its own tool outputs and
// summarizing them as JSON — replace with the direct connectors
// (leadbank.js / apollo.js, "Source B") the moment those keys land in .env.
// metrics.js only ever uses this when the direct source is "pending", never
// to override a direct source that's live or even erroring.
//
// RE-ACTIVATED 2026-07-11: Shawn added access to the leadbank_bi_*/apollo_mcp_*
// tools (LeadBank confirmed working; Apollo access was granted at the same
// time but may still fail — see below). Split into two independent chat
// completions (was one combined call) specifically so a failure in one
// system never masks the other's real data, and so each has its own raw
// response/error to hand to Shawn for debugging.
//
// Endpoint/model are best-guess and MUST be confirmed against the real
// instance:
// - OPENWEBUI_CHAT_COMPLETIONS_PATH defaults to /api/chat/completions
// - OPENWEBUI_COMPANYAI_MODEL has no default — connector stays pending
//   without it. Confirmed 2026-07-11 via GET /api/models: the model named
//   "Home Alliance AI" (not "... Lite") has id "home-allliance-ai" — note
//   the typo (3 l's), that's the real id, not a mistake in this file.
//
// KNOWN: this connector's chat-completions call fails with "TypeError: fetch
// failed" specifically from Vercel's network (analytics calls to the same
// Open WebUI host work fine there) — test locally first. Not yet root-caused;
// see server/vercel.json history. Handled below (2026-07-11): on Vercel, or
// when this specific error shows up anywhere, companyai() reports "pending"
// instead of "error" — it's a known environment block, not a real failure.
import { fetchWithRetry } from "../lib/fetchWithRetry.js";

export const LEADBANK_PROMPT =
  'Return ONLY valid JSON, no text, no markdown fences: ' +
  '{"calls":null,"paid":null,"invalid":null,"revenue":null,"profit":null,"conversionRate":null}. ' +
  "Use your leadbank_bi tool(s) for the last 30 days (days=30 window) to fill in real current numbers for: " +
  "total calls, paid/converted calls, invalid calls, revenue, profit, and conversion rate as a plain number " +
  '(e.g. 10.5, not "10.5%"). If a field is unavailable, put null for that field only. ' +
  "Do not include any explanation — JSON only.";

export const APOLLO_PROMPT =
  'Return ONLY valid JSON, no text, no markdown fences: ' +
  '{"technicians":[{"name":null,"revenue":null,"jobs":null,"winRate":null}],' +
  '"memberships":{"sold":null,"churn":null},"jobsByTrade":[{"trade":null,"count":null}]}. ' +
  "Use your apollo tool(s) to fill in real current data: technician revenue/jobs/win-rate, " +
  "total memberships sold and churned, and jobs won broken down by trade. " +
  "If technicians or jobsByTrade data isn't available, return an empty array for that field. " +
  "If memberships data isn't available, put null for sold/churn. Do not include any explanation — JSON only.";

function extractJson(text) {
  // The model may ignore the "no fences" instruction — strip ```json blocks if present.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  return JSON.parse(candidate.trim());
}

// Parsing successfully isn't the same as being USEFUL — if leadbank_bi/apollo
// tools return nothing, every field is null and this source is contributing
// zero data to any metric. status:"fallback" should mean "standing in with a
// real number," not "produced valid-but-empty JSON."
function allValuesNull(value) {
  if (value === null || value === undefined) return true;
  if (typeof value !== "object") return false;
  return Object.values(value).every(allValuesNull);
}

// KNOWN: Vercel's network can't reach Open WebUI's /api/chat/completions
// (analytics endpoints on the same host work fine there) — this is an
// environment block, not a code bug, and the route is separately blocked on
// tool execution anyway (see file header). Surfacing it as status:"error"
// makes the dashboard's error count misleading in production; downgrade it
// to "pending" instead. Detected two ways since either can fire first:
// process.env.VERCEL (Vercel sets this in every deployment), or the fetch
// itself throwing the specific "fetch failed" TypeError node-fetch/undici
// raises on a blocked/unreachable host. Any OTHER failure (bad auth, 5xx,
// unparseable JSON) is a real problem and must keep surfacing as "error".
const NETWORK_BLOCK_NOTE =
  "Company AI route unavailable on Vercel (chat endpoint blocked); also awaiting Open WebUI tool-execution support. Runs locally only.";

function isFetchFailedError(error) {
  return typeof error === "string" && /fetch failed/i.test(error);
}

function isKnownNetworkBlock(lb, ap) {
  if (process.env.VERCEL) return true;
  return isFetchFailedError(lb.error) && isFetchFailedError(ap.error);
}

// One chat completion for one system's prompt. Always returns enough to
// debug: the exact query sent, the raw model output (or raw error body), and
// whether it actually parsed — never throws, so Promise.all can't let one
// system's failure take down the other's result.
async function callModel(prompt) {
  const path = process.env.OPENWEBUI_CHAT_COMPLETIONS_PATH || "/api/chat/completions";
  try {
    const r = await fetchWithRetry(
      `${process.env.OPENWEBUI_URL}${path}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENWEBUI_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OPENWEBUI_COMPANYAI_MODEL,
          messages: [{ role: "user", content: prompt }],
        }),
      },
      20000 // LLM + tool calls can run well past the default 10s
    );
    if (!r.ok) {
      const bodyText = await r.text().catch(() => "");
      return { ok: false, query: prompt, error: `HTTP ${r.status}`, raw: bodyText };
    }
    const json = await r.json();
    const content = json?.choices?.[0]?.message?.content ?? json?.message?.content;
    if (!content) return { ok: false, query: prompt, error: "no content in response", raw: JSON.stringify(json) };

    try {
      const parsed = extractJson(content);
      return { ok: true, query: prompt, raw: content, parsed };
    } catch (e) {
      return { ok: false, query: prompt, error: `unparseable JSON: ${String(e)}`, raw: content };
    }
  } catch (e) {
    return { ok: false, query: prompt, error: String(e), raw: null };
  }
}

export async function companyai() {
  if (!process.env.OPENWEBUI_TOKEN || !process.env.OPENWEBUI_URL) {
    return { status: "pending", note: "OPENWEBUI_URL / OPENWEBUI_TOKEN not set" };
  }
  if (!process.env.OPENWEBUI_COMPANYAI_MODEL) {
    return { status: "pending", note: "OPENWEBUI_COMPANYAI_MODEL not set — pick the model with leadbank_bi/apollo tools attached" };
  }

  const [lb, ap] = await Promise.all([callModel(LEADBANK_PROMPT), callModel(APOLLO_PROMPT)]);

  const leadbankData = lb.ok ? lb.parsed : { calls: null, paid: null, invalid: null, revenue: null, profit: null, conversionRate: null };
  const apolloData = ap.ok ? ap.parsed : { technicians: [], memberships: { sold: null, churn: null }, jobsByTrade: [] };
  const data = { leadbank: leadbankData, apollo: apolloData };

  // Always attach per-system debug info — this is the whole point of
  // splitting the calls: an Apollo failure must stay visible even when
  // LeadBank succeeds, with the exact query + raw response/error to hand to Shawn.
  const debug = {
    leadbank: { ok: lb.ok, query: lb.query, raw: lb.raw, error: lb.error ?? null },
    apollo: { ok: ap.ok, query: ap.query, raw: ap.raw, error: ap.error ?? null },
  };

  if (!lb.ok && !ap.ok) {
    if (isKnownNetworkBlock(lb, ap)) {
      return { status: "pending", note: NETWORK_BLOCK_NOTE, debug };
    }
    return { status: "error", error: `LeadBank: ${lb.error}; Apollo: ${ap.error}`, debug };
  }

  if (allValuesNull(data)) {
    return {
      status: "degraded",
      data,
      debug,
      note: "Parsed successfully but every field is null — tools aren't returning data yet",
    };
  }

  const apolloEmpty = !ap.ok || allValuesNull(apolloData);
  return {
    status: "fallback",
    data,
    debug,
    note: "Temporary — replace with direct LeadBank/Apollo keys."
      + (apolloEmpty ? " Apollo tool(s) still returning nothing/failing — see debug.apollo for Shawn." : ""),
  };
}
