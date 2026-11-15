import { InputError } from "./monitor-validation";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function apiError(error: unknown) {
  if (error instanceof InputError) return json({ error: error.message }, error.status);
  console.error("Monitor request failed.");
  return json({ error: "Unable to access monitor storage. Check that PostgreSQL is running and retry." }, 503);
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  // Next.js may use localhost internally even when the browser uses 127.0.0.1.
  // Match the actual HTTP Host header rather than that internal hostname.
  const target = new URL(request.url);
  const expectedOrigin = `${target.protocol}//${request.headers.get("host") ?? target.host}`;
  if ((origin && origin !== expectedOrigin) || request.headers.get("sec-fetch-site") === "cross-site") throw new InputError("Requests must come from this application.", 403);
}

export async function readJson(request: Request): Promise<unknown> {
  assertSameOrigin(request);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new InputError("Use application/json for monitor settings.", 415);
  try { return await request.json(); } catch { throw new InputError("The request contains invalid JSON."); }
}
