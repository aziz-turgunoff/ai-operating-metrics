import cron from "node-cron";
import { runSnapshot } from "./runSnapshot.js";

// Monthly snapshot, 1st of the month at 09:00 server time — automates the
// "history problem" the README used to flag as a manual /api/snapshot call.
export function startScheduler() {
  cron.schedule("0 9 1 * *", async () => {
    try {
      const result = await runSnapshot();
      console.log(`[scheduler] snapshot #${result.snapshotId} saved for ${result.month}`);
    } catch (e) {
      console.error("[scheduler] snapshot failed:", e);
    }
  });
}
