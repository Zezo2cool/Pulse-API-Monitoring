import type { MonitorSettings } from "./monitor-types";

export class InputError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const fields = ["name", "url", "method", "expected_status", "interval_seconds", "timeout_ms", "enabled"] as const;

export function parseSettings(input: unknown, partial: true): Partial<MonitorSettings>;
export function parseSettings(input: unknown, partial?: false): MonitorSettings;
export function parseSettings(input: unknown, partial = false): Partial<MonitorSettings> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new InputError("Send a JSON object containing monitor settings.");
  const data = input as Record<string, unknown>;
  if (Object.keys(data).some((key) => !fields.includes(key as typeof fields[number]))) throw new InputError("The request contains an unknown setting.");
  if (partial && !Object.keys(data).length) throw new InputError("Provide at least one setting to update.");
  const result: Partial<MonitorSettings> = partial ? {} : {
    method: "GET", expected_status: 200, interval_seconds: 60, timeout_ms: 10000, enabled: true,
  };
  if (!partial || "name" in data) {
    if (typeof data.name !== "string" || !data.name.trim() || [...data.name.trim()].length > 120) throw new InputError("Name must contain between 1 and 120 characters.");
    result.name = data.name.trim();
  }
  if (!partial || "url" in data) {
    if (typeof data.url !== "string" || data.url.length > 2048 || /\s/.test(data.url.trim())) throw new InputError("Enter a valid HTTP or HTTPS URL, up to 2048 characters.");
    let url: URL;
    try { url = new URL(data.url.trim()); } catch { throw new InputError("Enter a complete URL, including https:// or http://."); }
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) throw new InputError("Use an HTTP or HTTPS URL without embedded credentials.");
    if (url.hash) throw new InputError("Remove the URL fragment (#); fragments are not sent to servers.");
    result.url = url.href;
  }
  if ("method" in data) {
    if (data.method !== "GET" && data.method !== "HEAD") throw new InputError("Method must be GET or HEAD.");
    result.method = data.method;
  }
  const numbers = [
    ["expected_status", 100, 599, "Expected status must be an integer from 100 to 599."],
    ["interval_seconds", 30, 86400, "Interval must be a whole number from 30 to 86400 seconds."],
    ["timeout_ms", 100, 60000, "Timeout must be a whole number from 100 to 60000 milliseconds."],
  ] as const;
  for (const [key, min, max, message] of numbers) {
    if (key in data) {
      const value = data[key];
      if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new InputError(message);
      result[key] = value;
    }
  }
  if ("enabled" in data) {
    if (typeof data.enabled !== "boolean") throw new InputError("Enabled must be true or false.");
    result.enabled = data.enabled;
  }
  if (result.timeout_ms !== undefined && result.interval_seconds !== undefined && result.timeout_ms > result.interval_seconds * 1000) throw new InputError("Timeout cannot be longer than the check interval.");
  return result;
}

export function validateId(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new InputError("Invalid monitor ID.");
}
