// Tasks automated / workflow executions / reports auto-generated (n8n/Zapier).
// No owner as of 2026-07-08 risk log (assigned to XTR to pick one up) — no API
// exists yet, so this stays pending until an owner + endpoint are confirmed.
export async function workflows() {
  if (!process.env.N8N_URL || !process.env.N8N_API_KEY) {
    return { status: "pending", note: "n8n + Zapier — no API yet, owner: XTR" };
  }
  try {
    const r = await fetch(`${process.env.N8N_URL}/api/v1/executions?limit=250`, {
      headers: { "X-N8N-API-KEY": process.env.N8N_API_KEY },
    });
    if (!r.ok) return { status: "error", error: `HTTP ${r.status}` };
    const data = await r.json();
    return { status: "live", data };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}
