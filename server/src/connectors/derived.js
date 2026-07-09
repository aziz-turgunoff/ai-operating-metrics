// Hours Saved / Cost Savings are not a data pull — they're computed from
// automation-impact counts (currently sourced from `workflows`, still pending
// an owner) times an assumed time-per-task.
//
// Locked 2026-07-08 (Jay, in #devs-and-product thread): $20/hr loaded rate.
// NOT YET LOCKED: minutes saved per automated task/execution — nobody has
// signed off on that number, so we refuse to invent one. Until
// AVG_MINUTES_SAVED_PER_TASK is set, hoursSaved/costSavings stay null even if
// `workflows` goes live, so we never publish a fabricated figure.
const RATE_USD_PER_HOUR = Number(process.env.HOURS_SAVED_RATE_USD_PER_HOUR ?? 20);

export function derived({ workflowsResult }) {
  const tasksAutomated = workflowsResult?.status === "live"
    ? workflowsResult.data?.tasksAutomated ?? workflowsResult.data?.data?.length ?? null
    : null;

  const minutesPerTask = process.env.AVG_MINUTES_SAVED_PER_TASK
    ? Number(process.env.AVG_MINUTES_SAVED_PER_TASK)
    : null;

  if (tasksAutomated == null || minutesPerTask == null) {
    return {
      status: "pending",
      note: minutesPerTask == null
        ? "Rate locked at $20/hr, but minutes-saved-per-task still needs sign-off"
        : "Waiting on workflows source (tasks automated)",
      hoursSaved: null,
      costSavings: null,
      rateUsdPerHour: RATE_USD_PER_HOUR,
    };
  }

  const hoursSaved = Math.round((tasksAutomated * minutesPerTask) / 60);
  const costSavings = Math.round(hoursSaved * RATE_USD_PER_HOUR);
  return { status: "live", hoursSaved, costSavings, rateUsdPerHour: RATE_USD_PER_HOUR };
}
