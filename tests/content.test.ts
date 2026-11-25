import { describe, expect, it } from "vitest";
import { content, displayOrder, getItem, idsToLetters, lettersToIds, letterMap, toStudentItem } from "@/lib/content";

describe("learning content", () => {
  it("has three modules with two anchors, two rechecks, and an activity", () => {
    expect(content.modules).toHaveLength(3);
    for (const m of content.modules) {
      expect(m.anchor_item_ids).toHaveLength(2);
      expect(m.recheck_item_ids).toHaveLength(2);
      expect(m.activity.steps.length).toBeGreaterThan(0);
      for (const id of [...m.anchor_item_ids, ...m.recheck_item_ids]) expect(getItem(id)).toBeDefined();
    }
    expect(content.items).toHaveLength(12);
  });

  it("is marked as pilot material requiring educator review", () => {
    expect(content.status).toMatch(/educator review required/i);
  });

  it("maps every non-expected reason to an interpretation", () => {
    for (const item of content.items) {
      for (const r of item.reason_options) {
        if (r.id === item.teacher_only.expected_reason_id) continue;
        expect(item.teacher_only.reason_interpretations[r.id]).toBeTruthy();
      }
    }
  });
});

describe("student projection", () => {
  it("contains no key, mapping, rationale, or stable option IDs", () => {
    for (const item of content.items) {
      const s = toStudentItem("run-xyz", item);
      const json = JSON.stringify(s);
      expect(json).not.toMatch(/expected_|teacher_only|reason_interpretations|rationale/);
      expect(json).not.toContain(item.teacher_only.rationale.slice(0, 30));
      for (const o of [...s.answerOptions, ...s.reasonOptions]) expect(o.id).toBe(o.letter);
      expect(json).not.toMatch(/"r[1-4]"/);
    }
  });

  it("round-trips letters and IDs for the same run", () => {
    const item = getItem("liq-anchor-01", 1)!;
    const ids = lettersToIds("run-1", item, "C", "B");
    const back = idsToLetters("run-1", item, ids.answerId as string, ids.reasonId as string);
    expect(back).toEqual({ answerId: "C", reasonId: "B" });
    expect(lettersToIds("run-1", item, "Z", null).answerId).toBeUndefined();
  });

  it("paper letters match the digital order for a run", () => {
    const item = getItem("div-anchor-02", 1)!;
    const s = toStudentItem("run-7", item);
    const m = letterMap("run-7", item);
    for (const o of s.answerOptions) expect(item.answer_options.find((x) => x.id === m.answers[o.letter])!.text).toBe(o.text);
  });

  it("keeps 'I am not sure' last and varies the expected answer position", () => {
    const positions = new Map<number, number>();
    let total = 0;
    for (let run = 0; run < 40; run++) {
      for (const item of content.items) {
        const o = displayOrder(`run-${run}`, item);
        expect(item.teacher_only.reason_interpretations[o.reasons.at(-1)!]).toBe("uncertain");
        const pos = o.answers.indexOf(item.teacher_only.expected_answer_id);
        positions.set(pos, (positions.get(pos) ?? 0) + 1);
        total++;
      }
    }
    expect(positions.size).toBe(4);
    for (const n of positions.values()) expect(n / total).toBeLessThan(0.4);
  });
});
