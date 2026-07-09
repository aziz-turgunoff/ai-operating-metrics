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
// Endpoint/model are best-guess and MUST be confirmed against the real
// instance:
// - OPENWEBUI_CHAT_COMPLETIONS_PATH defaults to /api/chat/completions
// - OPENWEBUI_COMPANYAI_MODEL has no default — connector stays pending
//   without it (need the model id that has leadbank_bi/apollo tools attached)
import { fetchWithRetry } from "../lib/fetchWithRetry.js";

export const COMPANYAI_PROMPT =
  'Return ONLY valid JSON, no text: {"leadbank":{"calls":null,"paid":null,"revenue":null,"conversionRate":null},"apollo":{"memberships":null,"jobsWon":null}}. ' +
  "Use your leadbank_bi and apollo tools to fill in real current numbers. If a tool fails, put null for that field. " +
  "Do not include any explanation, markdown, or code fences — JSON only.";

function extractJson(text) {
  // The model may ignore the "no fences" instruction — strip ```json blocks if present.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  return JSON.parse(candidate.trim());
}

export async function companyai() {
  if (!process.env.OPENWEBUI_TOKEN || !process.env.OPENWEBUI_URL) {
    return { status: "pending", note: "OPENWEBUI_URL / OPENWEBUI_TOKEN not set" };
  }
  if (!process.env.OPENWEBUI_COMPANYAI_MODEL) {
    return { status: "pending", note: "OPENWEBUI_COMPANYAI_MODEL not set — pick the model with leadbank_bi/apollo tools attached" };
  }

  try {
    const path = process.env.OPENWEBUI_CHAT_COMPLETIONS_PATH || "/api/chat/completions";
    const r = await fetchWithRetry(
      `${process.env.OPENWEBUI_URL}${path}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENWEBUI_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OPENWEBUI_COMPANYAI_MODEL,
          messages: [{ role: "user", content: COMPANYAI_PROMPT }],
        }),
      },
      20000 // LLM + tool calls can run well past the default 10s
    );
    // Note: fetchWithRetry only retries a transient network/timeout failure
    // (the fetch throwing) — a slow-but-successful completion just resolves
    // once. A real HTTP error response below is never retried.
    if (!r.ok) return { status: "error", error: `HTTP ${r.status}`, note: "Company-AI fallback request failed" };

    const json = await r.json();
    const content = json?.choices?.[0]?.message?.content ?? json?.message?.content;
    if (!content) return { status: "degraded", note: "AI fallback returned no content to parse" };

    try {
      const parsed = extractJson(content);
      return {
        status: "fallback",
        data: parsed,
        note: "Temporary — replace with direct LeadBank/Apollo keys",
      };
    } catch {
      return { status: "degraded", note: "AI fallback returned unparseable output", raw: content };
    }
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}
