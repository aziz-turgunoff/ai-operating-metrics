// Knowledge base growth: record counts, collections.
// Was blocked on a whitelist from XTR/Dmitrii — check QDRANT_URL/QDRANT_API_KEY
// before assuming this is still pending. Whitelist requested 2026-07-11 for
// static IP 4.227.180.184, pending Sergey; QDRANT_API_KEY is an admin key
// from Shawn (full access) — .env only, never commit.
//
// "Company" collection (confirmed by Shawn) holds Fireflies transcripts +
// company knowledge — its points_count is the primary "Knowledge records"
// metric (Company Intelligence). "Qdrant records" (AI Infrastructure Growth)
// is the SUM of points_count across every collection — a different, larger
// number; don't conflate the two (see metrics.js).
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
import { fetchWithTimeout } from "../lib/fetchWithTimeout.js";
import { num, pick } from "../lib/normalize.js";

export const QDRANT_HISTORY_NOTE =
  "Point-in-time count; month-over-month accrues via monthly snapshots (Grafana/Prometheus history pending via XTR).";

const COMPANY_COLLECTION = "Company";
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

export async function qdrant() {
  if (!process.env.QDRANT_URL || !process.env.QDRANT_API_KEY) {
    return { status: "pending", note: "Awaiting IP whitelist (Sergey) + QDRANT_URL/QDRANT_API_KEY" };
  }
  try {
    const listRes = await fetchWithTimeout(`${process.env.QDRANT_URL}/collections`, {
      headers: { "api-key": process.env.QDRANT_API_KEY },
    });
    if (!listRes.ok) return { status: "error", error: `HTTP ${listRes.status}` };
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
      status: "live",
      data: {
        collections: counts,
        companyPointsCount: company?.pointsCount ?? null,
        slackMessagesIndexed: slack?.pointsCount ?? null,
        meetingsIngested: meetings?.pointsCount ?? null,
        totalPointsCount,
      },
      note: QDRANT_HISTORY_NOTE
        + (company ? "" : ` No "${COMPANY_COLLECTION}" collection found — Knowledge records stayed null; confirm the name with Shawn.`)
        + (failed.length ? ` ${failed.length}/${counts.length} collections failed to return a count — see /api/debug/qdrant/collections.` : ""),
    };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}
