import { openrouter } from "./connectors/openrouter.js";
import { openwebui } from "./connectors/openwebui.js";
import { leadbank } from "./connectors/leadbank.js";
import { apollo } from "./connectors/apollo.js";
import { qdrant } from "./connectors/qdrant.js";
import { fireflies } from "./connectors/fireflies.js";
import { cicd } from "./connectors/cicd.js";
import { workflows } from "./connectors/workflows.js";
import { derived } from "./connectors/derived.js";

// Runs every connector in parallel and returns the raw per-source results.
// Kept separate from buildReport() so /api/metrics (read-only) and
// runSnapshot() (persists) share the exact same fetch logic.
export async function gatherSources() {
  const [or_, ow, lb, ap, qd, ff, ci, wf] = await Promise.all([
    openrouter(), openwebui(), leadbank(), apollo(), qdrant(), fireflies(), cicd(), workflows(),
  ]);
  const derivedResult = derived({ workflowsResult: wf });

  return {
    openrouter: or_, openwebui: ow, leadbank: lb, apollo: ap,
    qdrant: qd, fireflies: ff, cicd: ci, workflows: wf,
    derived: derivedResult, derivedResult,
  };
}
