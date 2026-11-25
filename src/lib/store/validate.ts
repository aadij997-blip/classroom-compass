import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getItem } from "@/lib/content";
import { CONFIDENCE_VALUES, type ItemRef } from "@/lib/domain/types";
import { StoreError, type LearnerAnswer } from "./types";

export const LEARNER_SESSION_HOURS = 3;
export const MAX_EXPLANATION = 400;
export const MAX_NOTE = 600;

export function newToken(prefix: string): string {
  return `${prefix}${randomBytes(24).toString("base64url")}`;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function aliasFor(position: number): string {
  return `Learner ${String(position).padStart(2, "0")}`;
}

/** Validates answer/reason IDs against the exact item version in a run. */
export function validateAnswer(runItems: ItemRef[], a: Pick<LearnerAnswer, "itemId" | "answerId" | "reasonId"> & Partial<LearnerAnswer>) {
  const ref = runItems.find((r) => r.itemId === a.itemId);
  if (!ref) throw new StoreError("invalid", "That question is not part of this check.");
  const item = getItem(ref.itemId, ref.version);
  if (!item) throw new StoreError("invalid", "Unknown question version.");
  if (a.answerId !== null && !item.answer_options.some((o) => o.id === a.answerId)) {
    throw new StoreError("invalid", "Unknown answer option.");
  }
  if (a.reasonId !== null && !item.reason_options.some((o) => o.id === a.reasonId)) {
    throw new StoreError("invalid", "Unknown reason option.");
  }
  if (a.confidence != null && !CONFIDENCE_VALUES.includes(a.confidence)) {
    throw new StoreError("invalid", "Unknown confidence value.");
  }
  if (a.explanation != null && a.explanation.length > MAX_EXPLANATION) {
    throw new StoreError("invalid", `Explanations are limited to ${MAX_EXPLANATION} characters.`);
  }
  return ref;
}

export function cleanText(s: string | null | undefined, max = MAX_NOTE): string | null {
  if (s == null) return null;
  const t = s.replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.slice(0, max);
}
