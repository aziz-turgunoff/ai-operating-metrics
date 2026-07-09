// Technician revenue / memberships / jobs from Apollo ERP.
//
// KNOWN BUG (filed 2026-07-08): the raw revenue endpoint fails intermittently
// with a generic NodeApiError — not date-related, the endpoint itself is
// flaky. We retry once, and if it still fails but we have a previous good
// response in this process's memory, we serve that stale copy marked
// `degraded:true` rather than fail outright. If we've never had a good
// response, we return status:"error" — we do not claim "live" with no data.
//
// KNOWN GAPS to surface, not silently resolve:
// - memberships totals differ by query scope (agent-level vs dept-level) —
//   `memberships.query` says which one this response used.
// - there is no "opportunities created" field anywhere in Apollo, only
//   jobs won/scheduled.
import { fetchWithTimeout } from "../lib/fetchWithTimeout.js";
import { num, pick } from "../lib/normalize.js";

let lastGood = null; // { data, at } — in-memory only, resets on server restart

function normalize(json) {
  const techs = pick(json, ["technicians", "by_technician"]) ?? [];
  const trades = pick(json, ["jobs_by_trade", "jobsByTrade"]) ?? [];
  const membershipQuery = process.env.APOLLO_MEMBERSHIP_SCOPE || "agent"; // "agent" | "department"

  return {
    technicians: techs.map((t) => ({
      name: pick(t, ["name", "technician"]),
      revenue: num(pick(t, ["revenue"])),
      jobs: num(pick(t, ["jobs", "job_count"])),
      winRate: num(pick(t, ["win_rate", "winRate"])),
    })),
    memberships: {
      sold: num(pick(json, [
        membershipQuery === "department" ? "memberships_sold_dept" : "memberships_sold_agent",
        "memberships_sold",
      ])),
      churn: num(pick(json, ["memberships_churn", "membership_churn"])),
      query: membershipQuery,
    },
    jobsByTrade: trades.map((t) => ({
      trade: pick(t, ["trade", "name"]),
      count: num(pick(t, ["count", "jobs_won", "jobsWon"])),
    })),
  };
}

async function fetchOnce() {
  const r = await fetchWithTimeout(`${process.env.APOLLO_URL}/revenue?window=mtd`, {
    headers: { Authorization: `Bearer ${process.env.APOLLO_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export async function apollo() {
  if (!process.env.APOLLO_KEY || !process.env.APOLLO_URL) {
    return { status: "pending", note: "APOLLO_URL / APOLLO_KEY not set" };
  }
  try {
    const json = await fetchOnce();
    const data = normalize(json);
    lastGood = { data, at: new Date().toISOString() };
    return { status: "live", data };
  } catch (firstErr) {
    try {
      const json = await fetchOnce(); // one retry, per spec
      const data = normalize(json);
      lastGood = { data, at: new Date().toISOString() };
      return { status: "live", data };
    } catch (secondErr) {
      if (lastGood) {
        return {
          status: "live",
          degraded: true,
          data: lastGood.data,
          note: `Raw revenue endpoint down (${String(secondErr)}) — showing last-good data from ${lastGood.at}`,
        };
      }
      return {
        status: "error",
        error: String(secondErr),
        note: "Raw revenue endpoint down and no cached data available yet",
      };
    }
  }
}
