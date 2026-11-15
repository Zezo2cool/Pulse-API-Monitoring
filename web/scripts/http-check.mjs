import { performance } from "node:perf_hooks";

export async function checkEndpoint(monitor) {
  const checkedAt = new Date();
  const startedAt = performance.now();
  const signal = AbortSignal.timeout(monitor.timeout_ms);

  let response;

  try {
    response = await fetch(monitor.url, {
      method: monitor.method,
      signal,
      redirect: "manual",
      cache: "no-store",
    });

    const responseTimeMs = Math.round(performance.now() - startedAt);

    const success = response.status === monitor.expected_status;

    return {
      checked_at: checkedAt,
      success,
      status_code: response.status,
      response_time_ms: responseTimeMs,
      error_message: success
        ? null
        : `Expected ${monitor.expected_status}, received ${response.status}`,
    };
  } catch (error) {
    return {
      checked_at: checkedAt,
      success: false,
      status_code: null,
      response_time_ms: Math.round(performance.now() - startedAt),
      error_message: signal.aborted
        ? `Request timed out after ${monitor.timeout_ms}ms`
        : `Request failed: ${error.cause?.code ?? error.name}`,
    };
  } finally {
    if (response?.body) {
      await response.body.cancel().catch(() => {});
    }
  }
}
