import { createPool } from "./database.mjs";
import { runMonitor } from "./run-monitor.mjs";

const monitorId = process.argv[2];

if (
  !monitorId ||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    monitorId,
  )
) {
  console.error("Usage: node scripts/check-monitor.mjs <monitor-uuid>");
  process.exit(1);
}

const pool = createPool();

try {
  const result = await runMonitor(pool, monitorId);

  if (result === null) {
    throw new Error("Monitor is paused or changed during the check.");
  }

  console.log(result);
} catch (error) {
  console.error("Check command failed:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
