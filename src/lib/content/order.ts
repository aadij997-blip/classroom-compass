// Deterministic display-order shuffling using stable option IDs.
// The same seed always gives the same order, so a printed paper copy, the paper
// entry grid, and the digital check show identical letters for a check run.

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Shuffle ids deterministically. `pinLast` ids (e.g. "I am not sure") stay at
 * the end in their given order so the uncertainty option is always easy to find.
 */
export function stableShuffle(ids: string[], seed: string, pinLast: string[] = []): string[] {
  const movable = ids.filter((id) => !pinLast.includes(id));
  const pinned = ids.filter((id) => pinLast.includes(id));
  const rand = mulberry32(hashString(seed));
  for (let i = movable.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [movable[i], movable[j]] = [movable[j], movable[i]];
  }
  return [...movable, ...pinned];
}

export const LETTERS = ["A", "B", "C", "D", "E", "F"];

export function orderSeed(checkRunId: string, itemId: string, version: number, kind: "answer" | "reason") {
  return `${checkRunId}|${itemId}|v${version}|${kind}`;
}
