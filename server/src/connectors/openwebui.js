// Self-hosted Open WebUI admin analytics: active users, messages, tokens,
// chats, per-user + per-model tables.
//
// IMPORTANT: this is a custom/self-hosted instance (oi.apollosoftwareservices.com)
// and the exact analytics route isn't documented anywhere I can verify without
// live access to the admin panel. OPENWEBUI_ANALYTICS_PATH lets you point this
// at the real route once you (or I, with browser access to the live admin UI)
// confirm it from the Network tab on /admin/analytics — default below is a guess.
import { fetchWithTimeout } from "../lib/fetchWithTimeout.js";
import { num, pick } from "../lib/normalize.js";

function normalize(json) {
  const users = pick(json, ["users", "by_user", "byUser"]) ?? [];
  const models = pick(json, ["models", "by_model", "byModel"]) ?? [];

  return {
    activeUsers: num(pick(json, ["active_users", "activeUsers", "user_count"])),
    messages: num(pick(json, ["messages", "total_messages", "message_count"])),
    tokens: num(pick(json, ["tokens", "total_tokens"])),
    chats: num(pick(json, ["chats", "total_chats", "chat_count"])),
    byUser: users.map((u) => ({
      user: pick(u, ["name", "email", "user"]),
      messages: num(pick(u, ["messages", "message_count"])),
      tokens: num(pick(u, ["tokens", "total_tokens"])),
    })),
    byModel: models.map((m) => ({
      model: pick(m, ["model", "name"]),
      messages: num(pick(m, ["messages", "message_count"])),
      tokens: num(pick(m, ["tokens", "total_tokens"])),
    })),
  };
}

export async function openwebui() {
  if (!process.env.OPENWEBUI_TOKEN || !process.env.OPENWEBUI_URL) {
    return { status: "pending", note: "OPENWEBUI_URL / OPENWEBUI_TOKEN not set" };
  }
  try {
    const path = process.env.OPENWEBUI_ANALYTICS_PATH || "/api/v1/analytics";
    const from = `${new Date().toISOString().slice(0, 7)}-01`;
    const r = await fetchWithTimeout(
      `${process.env.OPENWEBUI_URL}${path}?from=${from}`,
      { headers: { Authorization: `Bearer ${process.env.OPENWEBUI_TOKEN}` } }
    );
    if (!r.ok) return { status: "error", error: `HTTP ${r.status}`, note: `Tried ${path} — confirm the real route from the admin UI's network tab if this 404s` };
    const json = await r.json();
    return {
      status: "live",
      data: normalize(json),
      note: `Fetched from ${path} (OPENWEBUI_ANALYTICS_PATH) — this route is a best guess; verify against the live admin panel and set OPENWEBUI_ANALYTICS_PATH if it's wrong`,
    };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}
