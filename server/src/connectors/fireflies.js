// Meetings ingested / transcripts / summaries / AI action items.
export async function fireflies() {
  if (!process.env.FIREFLIES_API_KEY) {
    return { status: "pending", note: "FIREFLIES_API_KEY not set" };
  }
  try {
    const r = await fetch("https://api.fireflies.ai/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.FIREFLIES_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "query { transcripts(limit: 1) { title } }",
      }),
    });
    if (!r.ok) return { status: "error", error: `HTTP ${r.status}` };
    const data = await r.json();
    return { status: "live", data };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}
