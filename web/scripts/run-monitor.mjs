import { checkEndpoint } from "./http-check.mjs";

export async function runMonitor(pool, monitorId, { onlyIfDue = false } = {}) {
  const {
    rows: [monitor],
  } = await pool.query(
    `SELECT
       id, url, method, expected_status, timeout_ms, enabled,
       updated_at::text AS settings_version,
       next_check_at <= now() AS due
     FROM monitors
     WHERE id = $1`,
    [monitorId],
  );

  if (!monitor) {
    throw new Error("Monitor not found.");
  }

  if (!monitor.enabled || (onlyIfDue && !monitor.due)) {
    return null;
  }

  const result = await checkEndpoint(monitor);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const current = await client.query(
      `SELECT id
       FROM monitors
       WHERE id = $1
         AND enabled
         AND updated_at::text = $2
         AND (NOT $3::boolean OR next_check_at <= now())
       FOR UPDATE`,
      [monitor.id, monitor.settings_version, onlyIfDue],
    );

    if (current.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const saved = await client.query(
      `INSERT INTO check_results (
         monitor_id,
         checked_at,
         success,
         status_code,
         response_time_ms,
         error_message
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        monitor.id,
        result.checked_at,
        result.success,
        result.status_code,
        result.response_time_ms,
        result.error_message,
      ],
    );

    await client.query(
      `UPDATE monitors
       SET next_check_at =
         now() + interval_seconds * interval '1 second'
       WHERE id = $1`,
      [monitor.id],
    );

    await client.query("COMMIT");

    return {
      result_id: saved.rows[0].id,
      monitor_id: monitor.id,
      ...result,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
