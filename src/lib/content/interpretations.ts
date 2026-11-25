// Teacher-facing wording for interpretation tags. These describe a *possible*
// difficulty on one check — never a diagnosis or a learner trait.

import type { ConceptId } from "@/lib/domain/types";

export type TagKind = "concept" | "calculation" | "uncertain";

export interface TagInfo {
  kind: TagKind;
  /** Fits: "N of M completed checks suggest students may be …" */
  pattern: string;
  /** Short label for tables and chips. */
  short: string;
}

export const TAGS: Record<string, TagInfo> = {
  "opportunity-cost-is-price": {
    kind: "concept",
    pattern: "treating opportunity cost as only the price paid",
    short: "Cost = price paid",
  },
  "opportunity-cost-is-all-alternatives": {
    kind: "concept",
    pattern: "counting every unchosen option as the opportunity cost",
    short: "Every option given up",
  },
  "opportunity-cost-is-least-preferred": {
    kind: "concept",
    pattern: "picking the least-preferred option instead of the next-best one",
    short: "Least-preferred option",
  },
  "opportunity-cost-is-chosen-option": {
    kind: "concept",
    pattern: "naming the chosen option as what was given up",
    short: "The chosen option",
  },
  "diversification-guarantees-no-loss": {
    kind: "concept",
    pattern: "thinking that spreading money out guarantees no loss",
    short: "Spreading = no loss",
  },
  "diversification-guarantees-profit": {
    kind: "concept",
    pattern: "thinking that spreading money out guarantees a profit",
    short: "Spreading = profit",
  },
  "ignores-shared-sector-exposure": {
    kind: "concept",
    pattern: "assuming every sector is affected in exactly the same way",
    short: "All sectors the same",
  },
  "ignores-distinct-exposures": {
    kind: "concept",
    pattern: "assuming a problem in one part must hit every part",
    short: "One problem hits all",
  },
  "card-count-equals-diversification": {
    kind: "concept",
    pattern: "counting cards rather than comparing what each card is exposed to",
    short: "Counting cards",
  },
  "assets-are-immediately-available-cash": {
    kind: "concept",
    pattern: "treating invested money as immediately available",
    short: "Assets = cash today",
  },
  "stock-value-equals-cash-availability": {
    kind: "concept",
    pattern: "reading a higher asset value as more cash available today",
    short: "Higher value = more cash",
  },
  "arithmetic-check": {
    kind: "calculation",
    pattern: "making a calculation slip — check the numbers before assuming a liquidity idea",
    short: "Check the calculation",
  },
  uncertain: {
    kind: "uncertain",
    pattern: "unsure — they chose “I am not sure”",
    short: "Chose “not sure”",
  },
};

export function tagInfo(tag: string): TagInfo {
  return TAGS[tag] ?? { kind: "concept", pattern: `showing the pattern “${tag}”`, short: tag };
}

/** Observation categories offered per concept, plus shared ones. */
export const OBSERVATION_CATEGORIES: Record<ConceptId | "any", { id: string; label: string }[]> = {
  any: [
    { id: "explained_reasoning", label: "Explained their reasoning" },
    { id: "needed_prompt", label: "Needed a prompt to get there" },
    { id: "unsure_or_quiet", label: "Unsure or not yet heard from" },
    { id: "other", label: "Something else worth noting" },
  ],
  "opportunity-cost": [{ id: "next_best_alternative", label: "Named the next-best alternative" }],
  diversification: [{ id: "compared_exposure", label: "Compared exposure, not just card count" }],
  liquidity: [{ id: "separated_cash_and_assets", label: "Separated cash today from assets later" }],
};

export function observationCategoryLabel(id: string): string {
  for (const list of Object.values(OBSERVATION_CATEGORIES)) {
    const hit = list.find((c) => c.id === id);
    if (hit) return hit.label;
  }
  return id.replace(/_/g, " ");
}

export const SUPPORT_OPTIONS = [
  "Prompt read aloud",
  "Tokens or cards to hand",
  "Worked with a partner",
  "Extra time",
];

export const CONCEPT_SHORT: Record<ConceptId, string> = {
  "opportunity-cost": "Opportunity cost",
  diversification: "Diversification",
  liquidity: "Liquidity",
};

/** One useful thing to listen for during physical play (authored pilot copy). */
export const LISTEN_FOR: Record<ConceptId, { listen: string; ask: string }> = {
  "opportunity-cost": {
    listen: "Players naming the price paid, or every other choice, as “what I gave up.”",
    ask: "“What was your next-best choice — the one you would have picked instead?”",
  },
  diversification: {
    listen: "Players counting cards (“I have four stocks, so I’m safe”).",
    ask: "“If one kind of business has a bad day, which of your cards feel it?”",
  },
  liquidity: {
    listen: "Players treating stock value as money they can spend right now.",
    ask: "“If a payment were due this turn, which of your money could you actually use?”",
  },
};
