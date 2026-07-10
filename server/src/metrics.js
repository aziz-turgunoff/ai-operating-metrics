// Maps raw connector payloads into Sardor's report shape (2026-07-02,
// #devs-and-product). This is the ONLY place that translates "raw API
// response" into "a number on the dashboard" — connectors stay dumb fetchers.
//
// IMPORTANT: real field names below are best-guess until each source is
// confirmed live end-to-end. `pick()` never invents a number — if none of the
// candidate paths resolve, the metric stays null and renders as "—".

function pick(obj, paths) {
  for (const path of paths) {
    const value = path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function fmtNullable(v) {
  return v === null || v === undefined ? "an unknown number of" : v;
}

function sumTradeCounts(trades) {
  if (!Array.isArray(trades) || !trades.length) return null;
  const total = trades.reduce((acc, t) => acc + (typeof t.count === "number" ? t.count : 0), 0);
  return total || null;
}

function sumJobsByTrade(apolloData) {
  return sumTradeCounts(apolloData?.jobsByTrade);
}

// Source B (direct LeadBank/Apollo) wins whenever it's live. Source C
// (companyai) only fills in when B is exactly "pending" — never when B is
// "error", since a broken direct integration is a signal to fix, not paper
// over with an AI guess. Never used when it can't produce a real value.
// companyaiPathOrFn is either a dot-path string (pick()'d from companyai's
// data) or a function(data) for shapes pick() can't express, e.g. summing
// an array field.
function preferDirect(directValue, directStatus, directSourceKey, companyaiResult, companyaiPathOrFn) {
  if (directStatus === "live" && directValue != null) {
    return { value: directValue, source: directSourceKey, note: null };
  }
  if (directStatus === "pending" && companyaiResult?.status === "fallback") {
    const fbValue = typeof companyaiPathOrFn === "function"
      ? companyaiPathOrFn(companyaiResult.data)
      : pick(companyaiResult.data, [companyaiPathOrFn]);
    if (fbValue != null) {
      return { value: fbValue, source: "companyai", note: companyaiResult.note ?? "Temporary — replace with direct LeadBank/Apollo keys" };
    }
  }
  return { value: null, source: directSourceKey, note: null };
}

export function buildReport(results) {
  const { openrouter, openwebui, leadbank, apollo, qdrant, fireflies, cicd, workflows, companyai: ca, derivedResult } = results;

  const lb = leadbank.status === "live" ? leadbank.data : null;
  const ap = apollo.status === "live" ? apollo.data : null;
  const ow = openwebui.status === "live" ? openwebui.data : null;
  const or_ = openrouter.status === "live" ? openrouter.data : null;
  const qd = qdrant.status === "live" ? qdrant.data : null;
  const ff = fireflies.status === "live" ? fireflies.data : null;
  const ci = cicd.status === "live" ? cicd.data : null;
  const wf = workflows.status === "live" ? workflows.data : null;

  const northStar = [
    {
      key: "hours_saved", label: "Hours Saved by AI", unit: "hrs", source: "derived",
      value: derivedResult.hoursSaved, note: derivedResult.note,
    },
    (() => {
      const merged = preferDirect(pick(lb, ["revenue"]), leadbank.status, "leadbank", ca, "leadbank.revenue");
      return { key: "revenue", label: "Revenue Influenced / Recovered", unit: "$", ...merged };
    })(),
    {
      key: "deployments", label: "Production AI Deployments", unit: "", source: "cicd",
      value: Array.isArray(ci) ? ci.length : pick(ci, ["count", "deployments_count"]),
    },
    {
      key: "kb_growth", label: "Knowledge Base Growth", unit: "%", source: "qdrant",
      value: pick(qd, ["growth_pct"]), note: qd ? null : "Awaiting Grafana history",
    },
    {
      key: "idea_to_prod", label: "Avg Idea → Production", unit: "days", source: "cicd",
      value: pick(ci, ["avg_idea_to_prod_days"]),
    },
  ];

  const categories = [
    {
      name: "AI Adoption",
      metrics: [
        { label: "Active users", source: "openwebui", value: pick(ow, ["activeUsers"]) },
        { label: "Interactions (msgs)", source: "openwebui", value: pick(ow, ["messages"]) },
        {
          label: "Tokens processed", source: "openrouter", value: pick(or_, ["tokens"]),
          note: or_?.analyticsStatus === "pending" ? "Needs OPENROUTER_MGMT_KEY for per-model analytics" : or_?.analyticsStatus === "error" ? "Activity fetch failed — see server log" : null,
        },
        {
          label: "Total spend", unit: "$", source: "openrouter", value: pick(or_, ["spend"]),
          note: or_?.analyticsStatus === "pending" ? "Lifetime usage on this key (/auth/key), not month-to-date — add OPENROUTER_MGMT_KEY for a real monthly figure" : or_?.analyticsStatus === "live" ? "Rolling 30-day window, not calendar month — excludes current UTC day" : null,
        },
        {
          label: "Requests", source: "openrouter", value: pick(or_, ["requests"]),
          note: or_?.analyticsStatus === "pending" ? "Needs OPENROUTER_MGMT_KEY for per-model analytics" : null,
        },
        {
          label: "Depts using AI", source: "openwebui", value: null,
          note: "Open WebUI has no department field — would need a per-user-to-dept mapping elsewhere",
        },
      ],
    },
    {
      name: "Engineering Velocity",
      metrics: [
        { label: "Production deployments", source: "cicd", value: Array.isArray(ci) ? ci.length : null },
        { label: "AI workflows shipped", source: "workflows", value: pick(wf, ["workflows_shipped"]) },
        { label: "New agents", source: "cicd", value: pick(ci, ["new_agents"]) },
        { label: "New MCP tools", source: "cicd", value: pick(ci, ["new_mcp_tools"]) },
        { label: "Avg idea → production", unit: "days", source: "cicd", value: pick(ci, ["avg_idea_to_prod_days"]) },
      ],
    },
    {
      name: "Company Intelligence",
      metrics: [
        { label: "Meetings ingested", source: "fireflies", value: pick(ff, ["data.transcripts.length"]) },
        { label: "Transcripts", source: "fireflies", value: pick(ff, ["data.transcripts.length"]) },
        { label: "Knowledge records", source: "qdrant", value: pick(qd, ["points_count", "vectors_count"]) },
        { label: "Slack messages idx", source: "qdrant", value: pick(qd, ["slack_messages_indexed"]) },
        { label: "New data sources", source: "qdrant", value: pick(qd, ["new_sources"]) },
      ],
    },
    {
      name: "Automation Impact",
      metrics: [
        { label: "Tasks automated", source: "workflows", value: pick(wf, ["tasksAutomated", "data.length"]) },
        { label: "Workflow executions", source: "workflows", value: pick(wf, ["data.length"]) },
        { label: "Reports auto-gen", source: "workflows", value: pick(wf, ["reports_generated"]) },
        { label: "Meetings summarized", source: "fireflies", value: pick(ff, ["data.transcripts.length"]) },
        { label: "AI action items", source: "fireflies", value: pick(ff, ["action_items_count"]) },
      ],
    },
    {
      name: "Business Impact",
      metrics: [
        (() => {
          const merged = preferDirect(pick(lb, ["calls"]), leadbank.status, "leadbank", ca, "leadbank.calls");
          const bNote = lb ? `${fmtNullable(pick(lb, ["invalid"]))} invalid, ${fmtNullable(pick(lb, ["disputes"]))} disputes — total minus paid minus invalid leaves an unclassified bucket LeadBank doesn't label` : null;
          return { label: "Calls processed", ...merged, note: merged.note ?? bNote };
        })(),
        (() => {
          const merged = preferDirect(pick(lb, ["paid"]), leadbank.status, "leadbank", ca, "leadbank.paid");
          return { label: "Paid / converted", ...merged };
        })(),
        (() => {
          const merged = preferDirect(pick(lb, ["conversionRate"]), leadbank.status, "leadbank", ca, "leadbank.conversionRate");
          return { label: "Conversion rate", unit: "%", ...merged };
        })(),
        (() => {
          const merged = preferDirect(pick(lb, ["revenue"]), leadbank.status, "leadbank", ca, "leadbank.revenue");
          return { label: "Revenue influenced / recovered", unit: "$", ...merged };
        })(),
        (() => {
          const merged = preferDirect(pick(lb, ["profit"]), leadbank.status, "leadbank", ca, "leadbank.profit");
          return { label: "Profit", unit: "$", ...merged };
        })(),
        { label: "Payout", unit: "$", source: "leadbank", value: pick(lb, ["payout"]) },
        {
          label: "Cost savings", unit: "$", source: "derived", value: derivedResult.costSavings,
          note: `$${derivedResult.rateUsdPerHour}/hr locked; ${derivedResult.note ?? ""}`.trim(),
        },
        {
          label: "QA hours eliminated", source: "leadbank", value: null,
          note: "No hours-eliminated field yet — LeadBank CallQA only exposes a % time-reduction figure",
        },
        {
          label: "OOSA opportunities identified", source: "leadbank", value: null,
          note: "Source TBD — likely LeadBank CallQA per thread, not yet confirmed",
        },
        {
          label: "Membership opportunities identified", source: "apollo", value: null,
          note: "Distinct from \"memberships sold\" below — no source confirmed yet",
        },
        (() => {
          const merged = preferDirect(pick(ap, ["memberships.sold"]), apollo.status, "apollo", ca, "apollo.memberships.sold");
          const bNote = ap
            ? `Scoped by "${pick(ap, ["memberships.query"])}"-level query — the other scope returns a different total; pending source-of-truth decision`
            : "Two conflicting totals in Apollo (agent-level vs dept-level) — pending source-of-truth decision";
          return { label: "Memberships sold", ...merged, note: merged.note ?? bNote };
        })(),
        (() => {
          const merged = preferDirect(
            ap ? sumJobsByTrade(ap) : null, apollo.status, "apollo", ca,
            (data) => sumTradeCounts(data?.apollo?.jobsByTrade)
          );
          return { label: "Jobs won", ...merged };
        })(),
        {
          label: "Opportunities", source: "apollo", value: null,
          note: "No \"opportunities\" field exists in Apollo — metric undefined until redefined",
        },
      ],
    },
    {
      name: "AI Infrastructure Growth",
      metrics: [
        { label: "Qdrant records", source: "qdrant", value: pick(qd, ["points_count", "vectors_count"]) },
        { label: "Active AI skills", source: "cicd", value: pick(ci, ["active_skills"]) },
        { label: "Internal agents", source: "cicd", value: pick(ci, ["internal_agents"]) },
        { label: "Protected MCP endpts", source: "cicd", value: pick(ci, ["protected_mcp_endpoints"]) },
        { label: "Connected systems", source: "openwebui", value: pick(ow, ["connected_systems"]) },
      ],
    },
  ];

  return { northStar, categories };
}
