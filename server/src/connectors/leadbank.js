// Calls / revenue / conversion from LeadBank BI.
//
// KNOWN BUG (filed 2026-07-08): start_date/end_date params error with
// "invalid input syntax for type bigint" on the BI endpoint. Only the
// relative `days=N` lookback works — so this is a rolling window, NOT a fixed
// calendar month, until XTR/BI fixes the date-param casting.
//
// KNOWN GAP: total - paid - invalid leaves a large unclassified bucket the
// tool doesn't expose a field for. We surface the raw numbers as given
// instead of forcing them to reconcile.
import { fetchWithTimeout } from "../lib/fetchWithTimeout.js";
import { num, pick } from "../lib/normalize.js";

function normalize(json) {
  const calls = num(pick(json, ["calls_total", "totals.calls", "calls"]));
  const paid = num(pick(json, ["calls_paid", "totals.paid", "paid"]));
  const invalid = num(pick(json, ["calls_invalid", "totals.invalid", "invalid"]));
  const disputes = num(pick(json, ["disputes", "totals.disputes"]));
  const revenue = num(pick(json, ["revenue", "totals.revenue"]));
  const profit = num(pick(json, ["profit", "totals.profit"]));
  const payout = num(pick(json, ["payout", "totals.payout"]));
  const conversionRate = num(pick(json, ["conversion_rate", "conversionRate"]))
    ?? (calls && paid ? Math.round((paid / calls) * 1000) / 10 : null);

  return { calls, paid, invalid, disputes, revenue, profit, payout, conversionRate };
}

export async function leadbank() {
  if (!process.env.LEADBANK_KEY || !process.env.LEADBANK_URL) {
    return { status: "pending", note: "LEADBANK_URL / LEADBANK_KEY not set" };
  }
  try {
    const days = process.env.LEADBANK_DAYS || "30";
    const r = await fetchWithTimeout(`${process.env.LEADBANK_URL}/dashboard_kpis?days=${days}`, {
      headers: { "x-api-key": process.env.LEADBANK_KEY },
    });
    if (!r.ok) return { status: "error", error: `HTTP ${r.status}` };
    const json = await r.json();
    return {
      status: "live",
      data: normalize(json),
      note: `Rolling ${days}-day window, not a fixed calendar month — date-range endpoint is still broken`,
    };
  } catch (e) {
    return { status: "error", error: String(e) };
  }
}
