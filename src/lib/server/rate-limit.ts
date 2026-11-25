import "server-only";
// Small in-process sliding-window limiter. Limits are generous per network
// address because a whole class often shares one school IP; tighter limits
// apply per learner session. Keys are hashed by the caller where they contain
// secrets, and nothing here is logged.

const buckets = new Map<string, number[]>();

export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const list = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= limit) {
    buckets.set(key, list);
    return false;
  }
  list.push(now);
  buckets.set(key, list);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (!v.some((t) => now - t < 60_000)) buckets.delete(k);
  }
  return true;
}

export const LIMITS = {
  // ~35 learners × a few link opens each, per minute, from one school network.
  exchangePerIp: { limit: 240, windowMs: 60_000 },
  submitPerIp: { limit: 900, windowMs: 60_000 },
  submitPerLearner: { limit: 40, windowMs: 60_000 },
  authPerIp: { limit: 20, windowMs: 5 * 60_000 },
};
