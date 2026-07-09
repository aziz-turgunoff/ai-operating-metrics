// Knowledge base growth: record counts, collections.
// Was blocked on a whitelist from XTR/Dmitrii — check QDRANT_URL/QDRANT_API_KEY
// before assuming this is still pending.
export async function qdrant() {
  if (!process.env.QDRANT_URL || !process.env.QDRANT_API_KEY) {
    return { status: "pending", note: "Awaiting whitelist (XTR/Dmitrii) + Grafana history" };
  }
  try {
    const r = await fetch(`${process.env.QDRANT_URL}/collections`, {
      headers: { "api-key": process.env.QDRANT_API_KEY },
    });
    if (!r.ok) return { status: "error", error: `HTTP ${r.status}` };
    const data = await r.json();
    return { status: "live", data };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}
