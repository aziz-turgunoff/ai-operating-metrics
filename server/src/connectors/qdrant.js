// Knowledge base growth: record counts, collections.
// Whitelist cleared 2026-07-21 — dashboard + API access confirmed. Note the
// whitelist was granted for the requester's static IP; if this errors in
// Vercel prod but works locally, Vercel's egress IP likely isn't whitelisted
// yet — flag to Sergey rather than assuming the connector is broken.
// QDRANT_API_KEY is an admin key from Shawn (full access) — .env only, never commit.
//
// "company" collection (lowercase, confirmed live 2026-07-21) holds company
// knowledge — its points_count is the primary "Knowledge records" metric
// (Company Intelligence). "Qdrant records" (AI Infrastructure Growth) is the
// SUM of points_count across every collection — a different, larger number;
// don't conflate the two (see metrics.js). Live instance has 4 collections:
// company, passport, sardor, test — no separate slack/meetings collection
// exists; that data lives inside "company", not standalone.
//
// "Slack messages idx" resolves from a collection whose name looks
// slack-related, if one exists — never guessed from an unrelated collection.
// "Meetings ingested" stays Fireflies-sourced (see metrics.js) since that's
// already a real, live path; meetingsIngested is exposed here too in case
// that changes later, but isn't wired to that metric today.
//
// No monthly history yet: points_count is a single point-in-time read. The
// existing monthly cron already snapshots /api/metrics, so month-over-month
// trend accrues automatically from here on — no separate Grafana pull needed
// until XTR sets one up.
//
// CONFIRMED 2026-07-21: Qdrant's whitelist covers one static IP (the Outline
// VPN exit node Sergey approved), not Vercel's rotating serverless egress —
// direct fetch works from any machine on that VPN but 403s from Vercel.
// Rather than block on Enterprise-only static-IP hosting, qdrant() below
// falls back to the last value POSTed to /api/push/qdrant (see
// routes/qdrantPush.js) by scripts/pushQdrantCache.js, run locally over the
// VPN. Falls back to status "error" only if no push has ever landed.
import { fetchWithTimeout } from "../lib/fetchWithTimeout.js";
import { num, pick } from "../lib/normalize.js";
import { prisma } from "../db.js";

export const QDRANT_HISTORY_NOTE =
  "Point-in-time count; month-over-month accrues via monthly snapshots (Grafana/Prometheus history pending via XTR).";

export const CACHE_KEY = "qdrant";

const COMPANY_COLLECTION = "company";
const SLACK_NAME_HINTS = ["slack"];
const MEETINGS_NAME_HINTS = ["meeting", "fireflies", "transcript"];

function findByHint(counts, hints) {
  return counts.find((c) => hints.some((hint) => c.name.toLowerCase().includes(hint)));
}

async function fetchPointsCount(name) {
  const r = await fetchWithTimeout(
    `${process.env.QDRANT_URL}/collections/${encodeURIComponent(name)}`,
    { headers: { "api-key": process.env.QDRANT_API_KEY } }
  );
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const json = await r.json();
  return num(pick(json, ["result.points_count", "points_count"]));
}

// The real Qdrant call — only reachable from a whitelisted IP. Exported so
// scripts/pushQdrantCache.js (run on a VPN-connected machine) can reuse the
// exact same shaping logic instead of duplicating it.
export async function fetchQdrantDirect() {
  const listRes = await fetchWithTimeout(`${process.env.QDRANT_URL}/collections`, {
    headers: { "api-key": process.env.QDRANT_API_KEY },
  });
  if (!listRes.ok) throw new Error(`HTTP ${listRes.status}`);
  const listJson = await listRes.json();
  const names = (pick(listJson, ["result.collections"]) ?? []).map((c) => c.name).filter(Boolean);

  const counts = await Promise.all(
    names.map(async (name) => {
      try {
        return { name, pointsCount: await fetchPointsCount(name), error: null };
      } catch (e) {
        return { name, pointsCount: null, error: String(e) };
      }
    })
  );

  const company = counts.find((c) => c.name === COMPANY_COLLECTION);
  const slack = findByHint(counts, SLACK_NAME_HINTS);
  const meetings = findByHint(counts, MEETINGS_NAME_HINTS);
  const totalPointsCount = counts.reduce((acc, c) => acc + (c.pointsCount ?? 0), 0);
  const failed = counts.filter((c) => c.error);

  return {
    collections: counts,
    companyPointsCount: company?.pointsCount ?? null,
    slackMessagesIndexed: slack?.pointsCount ?? null,
    meetingsIngested: meetings?.pointsCount ?? null,
    totalPointsCount,
    note: (company ? "" : ` No "${COMPANY_COLLECTION}" collection found — Knowledge records stayed null; confirm the name with Shawn.`)
      + (failed.length ? ` ${failed.length}/${counts.length} collections failed to return a count — see /api/debug/qdrant/collections.` : ""),
  };
}

async function readCache() {
  const row = await prisma.sourceCache.findUnique({ where: { sourceKey: CACHE_KEY } }).catch(() => null);
  if (!row) return null;
  return { data: JSON.parse(row.data), updatedAt: row.updatedAt };
}

export async function qdrant() {
  if (!process.env.QDRANT_URL || !process.env.QDRANT_API_KEY) {
    return { status: "pending", note: "Awaiting IP whitelist (Sergey) + QDRANT_URL/QDRANT_API_KEY" };
  }
  try {
    const { note, ...data } = await fetchQdrantDirect();
    return { status: "live", data, note: QDRANT_HISTORY_NOTE + note };
  } catch (directError) {
    const cached = await readCache();
    if (!cached) return { status: "error", error: String(directError) };
    return {
      status: "live",
      data: cached.data,
      degraded: true,
      note: QDRANT_HISTORY_NOTE
        + ` Served from a local push at ${cached.updatedAt.toISOString()} — direct fetch failed (${String(directError)}); `
        + `Vercel's egress isn't on Qdrant's whitelist. Run scripts/pushQdrantCache.js over the VPN to refresh.`,
    };
  }
}
