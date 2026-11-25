import "server-only";
// Server-only access to the versioned learning content. The full JSON (with
// teacher_only keys) is imported here and must never reach a client bundle.
// Student devices receive `toStudentItem` projections only.

import raw from "../../../content/learning-content.json";
import type { ConceptId, ItemRef, Phase } from "@/lib/domain/types";
import { LETTERS, orderSeed, stableShuffle } from "./order";
import type { FullItem, LearningContent, Module, StudentItem, Activity } from "./schema";
import { itemsForPhase } from "./schema";

export const content = raw as unknown as LearningContent;
export const CONTENT_VERSION = content.content_version;
export const CONTENT_STATUS = content.status;

const itemsByKey = new Map<string, FullItem>(content.items.map((i) => [`${i.id}@${i.version}`, i]));
const latestById = new Map<string, FullItem>();
for (const item of content.items) {
  const prev = latestById.get(item.id);
  if (!prev || prev.version < item.version) latestById.set(item.id, item);
}

export function getModule(conceptId: string): Module | undefined {
  return content.modules.find((m) => m.id === conceptId);
}

export function allModules(): Module[] {
  return content.modules;
}

export function getActivity(activityId: string): { module: Module; activity: Activity } | undefined {
  for (const module of content.modules) {
    if (module.activity.id === activityId) return { module, activity: module.activity };
  }
  return undefined;
}

export function getItem(itemId: string, version?: number): FullItem | undefined {
  if (version === undefined) return latestById.get(itemId);
  return itemsByKey.get(`${itemId}@${version}`);
}

/** Current item references (id + latest version) for a concept and phase. */
export function itemRefsFor(conceptId: ConceptId, phase: Phase): ItemRef[] {
  const module = getModule(conceptId);
  if (!module) throw new Error(`Unknown concept ${conceptId}`);
  return itemsForPhase(module, phase).map((id) => {
    const item = getItem(id);
    if (!item) throw new Error(`Missing item ${id}`);
    return { itemId: item.id, version: item.version };
  });
}

export function isUncertainReason(item: FullItem, reasonId: string): boolean {
  return item.teacher_only.reason_interpretations[reasonId] === "uncertain";
}

function uncertainIds(item: FullItem): string[] {
  return Object.entries(item.teacher_only.reason_interpretations)
    .filter(([, tag]) => tag === "uncertain")
    .map(([id]) => id);
}

export interface DisplayOrder {
  answers: string[];
  reasons: string[];
}

/** Display order for one item in one check run (identical on paper and screen). */
export function displayOrder(checkRunId: string, item: FullItem): DisplayOrder {
  return {
    answers: stableShuffle(
      item.answer_options.map((o) => o.id),
      orderSeed(checkRunId, item.id, item.version, "answer"),
    ),
    reasons: stableShuffle(
      item.reason_options.map((o) => o.id),
      orderSeed(checkRunId, item.id, item.version, "reason"),
      uncertainIds(item),
    ),
  };
}

/** Student-safe projection. Contains no key, mapping, or rationale. */
export function toStudentItem(checkRunId: string, item: FullItem): StudentItem {
  const order = displayOrder(checkRunId, item);
  const answerText = new Map(item.answer_options.map((o) => [o.id, o.text]));
  const reasonText = new Map(item.reason_options.map((o) => [o.id, o.text]));
  return {
    id: item.id,
    version: item.version,
    scenario: item.scenario,
    question: item.question,
    reasonPrompt: item.reason_prompt,
    // Student payloads identify options only by their displayed letter. Stable
    // option IDs (which follow a pattern in the source content) never leave the server.
    answerOptions: order.answers.map((id, i) => ({ id: LETTERS[i], letter: LETTERS[i], text: answerText.get(id)! })),
    reasonOptions: order.reasons.map((id, i) => ({ id: LETTERS[i], letter: LETTERS[i], text: reasonText.get(id)! })),
  };
}

/** Letter → option id mapping used by the paper entry grid. */
export function letterMap(checkRunId: string, item: FullItem) {
  const order = displayOrder(checkRunId, item);
  return {
    answers: Object.fromEntries(order.answers.map((id, i) => [LETTERS[i], id])) as Record<string, string>,
    reasons: Object.fromEntries(order.reasons.map((id, i) => [LETTERS[i], id])) as Record<string, string>,
  };
}

export function optionText(item: FullItem, kind: "answer" | "reason", id: string | null): string | null {
  if (!id) return null;
  const list = kind === "answer" ? item.answer_options : item.reason_options;
  return list.find((o) => o.id === id)?.text ?? null;
}

/** Converts displayed letters from a student device back to stable option IDs (null if unknown). */
export function lettersToIds(checkRunId: string, item: FullItem, answer: string | null, reason: string | null) {
  const m = letterMap(checkRunId, item);
  return {
    answerId: answer === null ? null : (m.answers[answer] ?? undefined),
    reasonId: reason === null ? null : (m.reasons[reason] ?? undefined),
  };
}

/** Converts stored option IDs to the letters this check run displays. */
export function idsToLetters(checkRunId: string, item: FullItem, answerId: string | null, reasonId: string | null) {
  const order = displayOrder(checkRunId, item);
  return {
    answerId: answerId ? (LETTERS[order.answers.indexOf(answerId)] ?? null) : null,
    reasonId: reasonId ? (LETTERS[order.reasons.indexOf(reasonId)] ?? null) : null,
  };
}
