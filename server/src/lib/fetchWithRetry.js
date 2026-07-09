// Shared retry wrapper around fetchWithTimeout.
//
// Retries ONLY on transient network/timeout failures — i.e. cases where
// fetch() itself throws (AbortError from the timeout firing, DNS failure,
// connection reset, etc). An HTTP error response (401/403/404/5xx) never
// throws — fetch() resolves normally with `.ok === false` — so it is never
// retried here and must keep surfacing as a real error upstream. This is
// what keeps a genuine auth/config problem from being retried into a false
// "live".
//
// Root cause this exists for: connectors were using a single fetchWithTimeout
// call with no retry, so one slow DNS lookup / cold TLS handshake / dropped
// packet on an otherwise-healthy endpoint (e.g. OpenRouter's
// "AbortError: This operation was aborted" seen in stress testing) turned
// into a hard status:"error" instead of a quick, quiet second attempt.
import { fetchWithTimeout } from "./fetchWithTimeout.js";

export async function fetchWithRetry(url, options = {}, timeoutMs = 10000, { retries = 1, backoffMs = 250 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchWithTimeout(url, options, timeoutMs);
    } catch (e) {
      lastErr = e;
      if (attempt === retries) break;
      if (backoffMs > 0) await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  throw lastErr;
}
