import { setTimeout as sleep } from "node:timers/promises";
import { createPool } from "./database.mjs";
import { runMonitor } from "./run-monitor.mjs";

const pool = createPool();
let stopping = false;

pool.on("error", (error) => {
  console.error(
    "An idle database connection failed:",
    error.code ?? error.name,
  );
});

function requestStop() {
  if (!stopping) {
    console.log("Stopping after the current check...");
  }

  stopping = true;
}

process.on("SIGINT", requestStop);
process.on("SIGTERM", requestStop);

console.log("Monitor worker started.");

try {
  while (!stopping) {
    try {
      const { rows: monitors } = await pool.query(
        `SELECT id
         FROM monitors
         WHERE enabled
           AND next_check_at <= now()
         ORDER BY next_check_at, id
         LIMIT 10`,
      );

      for (const monitor of monitors) {
        if (stopping) break;

        try {
          const result = await runMonitor(pool, monitor.id, {
            onlyIfDue: true,
          });

          if (result !== null) {
            console.log(result);
          }
        } catch (error) {
          console.error(
            `Unable to process monitor ${monitor.id}:`,
            error.message,
          );
        }
      }
    } catch (error) {
      console.error("Unable to load due monitors:", error.message);

      if (!stopping) {
        await sleep(5000);
      }

      continue;
    }

    if (!stopping) {
      await sleep(1000);
    }
  }
} finally {
  await pool.end();
  console.log("Monitor worker stopped.");
}
