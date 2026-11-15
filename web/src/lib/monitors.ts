import "server-only";
import { getDatabase } from "./db";
import { InputError, parseSettings } from "./monitor-validation";
import type { Monitor, MonitorSettings } from "./monitor-types";

const columns = "id, name, url, method, expected_status, interval_seconds, timeout_ms, enabled, next_check_at, created_at, updated_at";
const settingKeys = ["name", "url", "method", "expected_status", "interval_seconds", "timeout_ms", "enabled"] as const;

export async function listMonitors() {
  return (await getDatabase().query<Monitor>(`SELECT ${columns} FROM monitors ORDER BY created_at DESC, id`)).rows;
}

export async function createMonitor(settings: MonitorSettings) {
  const { rows } = await getDatabase().query<Monitor>(
    `INSERT INTO monitors (${settingKeys.join(", ")}) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${columns}`,
    settingKeys.map((key) => settings[key]),
  );
  return rows[0];
}

export async function updateMonitor(id: string, changes: Partial<MonitorSettings>) {
  const client = await getDatabase().connect();
  try {
    await client.query("BEGIN");
    const { rows: [current] } = await client.query<Monitor>(`SELECT ${columns} FROM monitors WHERE id = $1 FOR UPDATE`, [id]);
    if (!current) throw new InputError("This monitor no longer exists. Refresh the list.", 404);
    // Validate combined settings while holding a row lock to protect concurrent updates.
    const settings = parseSettings(Object.fromEntries(settingKeys.map((key) => [key, changes[key] ?? current[key]])));
    const { rows } = await client.query<Monitor>(
      `UPDATE monitors SET ${settingKeys.map((key, index) => `${key} = $${index + 2}`).join(", ")},
       updated_at = now(), next_check_at = CASE
         WHEN ($8 AND NOT enabled) OR $3 <> url OR $4 <> method OR $5 <> expected_status
              OR $6 <> interval_seconds OR $7 <> timeout_ms THEN now()
         ELSE next_check_at END
       WHERE id = $1 RETURNING ${columns}`,
      [id, ...settingKeys.map((key) => settings[key])],
    );
    await client.query("COMMIT");
    return rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export async function deleteMonitor(id: string) {
  const { rowCount } = await getDatabase().query("DELETE FROM monitors WHERE id = $1", [id]);
  if (!rowCount) throw new InputError("This monitor no longer exists. Refresh the list.", 404);
}
