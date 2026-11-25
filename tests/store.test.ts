import { beforeEach, describe, expect, it } from "vitest";
import { SqliteStore } from "@/lib/store/sqlite";
import { itemRefsFor, getItem } from "@/lib/content";
import { summarizeCheck } from "@/lib/analytics";

let store: SqliteStore;
const A = "teacher-a";
const B = "teacher-b";

async function setup() {
  const { classId, tokens } = await store.createClass(A, { title: "Room 5", gradeBand: "4–6", learnerCount: 4 });
  const items = itemRefsFor("liquidity", "exit");
  const { sessionId, checkRunId } = await store.createSession(A, { classId, conceptId: "liquidity", goal: "g", mode: "digital", phase: "exit", items });
  return { classId, tokens, sessionId, checkRunId: checkRunId!, items };
}

async function learnerSession(token: string) {
  const ex = await store.exchangeToken(token);
  expect(ex).not.toBeNull();
  return ex!.sessionToken;
}

const answers = [
  { itemId: "liq-anchor-01", answerId: "a", reasonId: "r1", confidence: "sure" as const, explanation: null },
  { itemId: "liq-anchor-02", answerId: "b", reasonId: "r2", confidence: null, explanation: "it has stuff" },
];

beforeEach(() => {
  store = new SqliteStore(":memory:", "c-");
});

describe("teacher ownership", () => {
  it("teacher B cannot read, change, or delete teacher A's class", async () => {
    const { classId, checkRunId, sessionId, tokens } = await setup();
    expect(await store.getClassBundle(B, classId)).toBeNull();
    expect(await store.listClasses(B)).toHaveLength(0);
    await expect(store.deleteClass(B, classId)).rejects.toThrow();
    await expect(store.setCheckRunState(B, checkRunId, "open")).rejects.toThrow();
    await expect(store.savePaperEntries(B, checkRunId, [{ learnerId: tokens[0].learnerId, itemId: "liq-anchor-01", answerId: "a", reasonId: "r1" }])).rejects.toThrow();
    await expect(store.issueTokens(B, classId, [tokens[0].learnerId])).rejects.toThrow();
    await expect(store.addObservation(B, classId, { sessionId, conceptId: "liquidity", scope: "class", learnerId: null, groupId: null, category: "other", supports: null, note: "x", tally: null, denominator: null, observedOn: "2026-11-24" })).rejects.toThrow();
    expect(await store.findClassId(B, "session", sessionId)).toBeNull();
    expect(await store.getClassBundle(A, classId)).not.toBeNull();
  });

  it("rejects learner IDs from another class even for the owner", async () => {
    const one = await setup();
    const two = await store.createClass(A, { title: "Room 6", gradeBand: "4–6", learnerCount: 1 });
    await store.setCheckRunState(A, one.checkRunId, "open");
    await expect(store.savePaperEntries(A, one.checkRunId, [{ learnerId: two.tokens[0].learnerId, itemId: "liq-anchor-01", answerId: "a", reasonId: "r1" }])).rejects.toThrow(/does not belong/);
  });
});

describe("learner access", () => {
  it("stores tokens hashed, never in plain text", async () => {
    const { tokens } = await setup();
    const rows = store.db.prepare("SELECT token_hash FROM learners").all() as { token_hash: string }[];
    for (const t of tokens) expect(rows.some((r) => r.token_hash === t.token)).toBe(false);
    expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.token_hash))).toBe(true);
  });

  it("closed or draft checks reject submissions server-side", async () => {
    const { tokens, checkRunId } = await setup();
    const s = await learnerSession(tokens[0].token);
    await expect(store.submit(s, { checkRunId, submissionId: "sub-aaaaaaaa", answers })).rejects.toThrow(/closed/);
    await store.setCheckRunState(A, checkRunId, "open");
    await store.submit(s, { checkRunId, submissionId: "sub-bbbbbbbb", answers });
    await store.setCheckRunState(A, checkRunId, "closed");
    await expect(store.submit(s, { checkRunId, submissionId: "sub-cccccccc", answers })).rejects.toThrow(/closed/);
  });

  it("a learner cannot submit to another class's check", async () => {
    const one = await setup();
    const two = await setup();
    await store.setCheckRunState(A, two.checkRunId, "open");
    const s = await learnerSession(one.tokens[0].token);
    await expect(store.submit(s, { checkRunId: two.checkRunId, submissionId: "sub-dddddddd", answers })).rejects.toThrow(/not available/);
  });

  it("revoked and rotated links stop working", async () => {
    const { classId, tokens, checkRunId } = await setup();
    await store.setCheckRunState(A, checkRunId, "open");
    const s = await learnerSession(tokens[0].token);
    await store.revokeLearner(A, classId, tokens[0].learnerId);
    expect(await store.exchangeToken(tokens[0].token)).toBeNull();
    expect(await store.learnerContext(s)).toBeNull();
    await expect(store.submit(s, { checkRunId, submissionId: "sub-eeeeeeee", answers })).rejects.toThrow(/expired/);

    const s2 = await learnerSession(tokens[1].token);
    const [fresh] = await store.issueTokens(A, classId, [tokens[1].learnerId]);
    expect(await store.exchangeToken(tokens[1].token)).toBeNull();
    expect(await store.learnerContext(s2)).toBeNull();
    expect(await store.exchangeToken(fresh.token)).not.toBeNull();
  });

  it("learner context contains no keys, roster, or peer data", async () => {
    const { tokens, checkRunId } = await setup();
    await store.setCheckRunState(A, checkRunId, "open");
    const s0 = await learnerSession(tokens[0].token);
    const s1 = await learnerSession(tokens[1].token);
    await store.submit(s1, { checkRunId, submissionId: "sub-ffffffff", answers });
    const ctx = await store.learnerContext(s0);
    const json = JSON.stringify(ctx);
    expect(json).not.toMatch(/expected_|teacher_only|reason_interpretations|rationale/);
    expect(ctx!.responses).toHaveLength(0);
    expect(json).not.toContain(tokens[1].alias);
  });

  it("rejects options not in the exact item version", async () => {
    const { tokens, checkRunId } = await setup();
    await store.setCheckRunState(A, checkRunId, "open");
    const s = await learnerSession(tokens[0].token);
    await expect(store.submit(s, { checkRunId, submissionId: "sub-gggggggg", answers: [{ ...answers[0], answerId: "z" }] })).rejects.toThrow(/Unknown answer/);
    await expect(store.submit(s, { checkRunId, submissionId: "sub-hhhhhhhh", answers: [{ ...answers[0], itemId: "oc-anchor-01" }] })).rejects.toThrow(/not part/);
  });
});

describe("idempotency and revision history", () => {
  it("retrying a submission does not duplicate or inflate counts", async () => {
    const { tokens, checkRunId, classId } = await setup();
    await store.setCheckRunState(A, checkRunId, "open");
    const s = await learnerSession(tokens[0].token);
    const first = await store.submit(s, { checkRunId, submissionId: "sub-retry-01", answers });
    const again = await store.submit(s, { checkRunId, submissionId: "sub-retry-01", answers });
    expect(first).toEqual({ saved: 2, duplicate: false });
    expect(again.duplicate).toBe(true);
    // Same content under a new submission id is also a no-op.
    expect((await store.submit(s, { checkRunId, submissionId: "sub-retry-02", answers })).saved).toBe(0);
    const b = (await store.getClassBundle(A, classId))!;
    expect(b.responses).toHaveLength(2);
    const sum = summarizeCheck(b.checkRuns[0], b.learners, b.responses, (i, v) => getItem(i, v));
    expect(sum.complete).toBe(1);
  });

  it("changing an answer keeps the previous revision", async () => {
    const { tokens, checkRunId, classId } = await setup();
    await store.setCheckRunState(A, checkRunId, "open");
    const s = await learnerSession(tokens[0].token);
    await store.submit(s, { checkRunId, submissionId: "sub-rev-0001", answers });
    await store.submit(s, { checkRunId, submissionId: "sub-rev-0002", answers: [{ ...answers[1], answerId: "a", reasonId: "r1" }] });
    const b = (await store.getClassBundle(A, classId))!;
    const r = b.responses.find((x) => x.itemId === "liq-anchor-02")!;
    expect(r.revision).toBe(2);
    const hist = await store.responseHistory(A, r.id);
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ answerId: "b", reasonId: "r2", revision: 1 });
    expect(await store.responseHistory(B, r.id)).toHaveLength(0);
  });
});

describe("paper entry", () => {
  it("records paper source, distinguishes blank from not entered, and respects closure", async () => {
    const { tokens, checkRunId, classId } = await setup();
    await store.savePaperEntries(A, checkRunId, [
      { learnerId: tokens[0].learnerId, itemId: "liq-anchor-01", answerId: "a", reasonId: "r1" },
      { learnerId: tokens[0].learnerId, itemId: "liq-anchor-02", answerId: "a", reasonId: "r1" },
      { learnerId: tokens[1].learnerId, itemId: "liq-anchor-01", answerId: null, reasonId: null },
    ]);
    const b = (await store.getClassBundle(A, classId))!;
    expect(b.responses.every((r) => r.source === "paper_entered_by_teacher")).toBe(true);
    const s = summarizeCheck(b.checkRuns[0], b.learners, b.responses, (i, v) => getItem(i, v));
    expect(s.distribution.reasoning_shown).toBe(1);
    expect(s.distribution.incomplete).toBe(1); // handed in blank
    expect(s.distribution.not_started).toBe(2); // not entered
    await store.setCheckRunState(A, checkRunId, "closed");
    await expect(store.savePaperEntries(A, checkRunId, [{ learnerId: tokens[2].learnerId, itemId: "liq-anchor-01", answerId: "a", reasonId: "r1" }])).rejects.toThrow(/closed/);
  });
});

describe("observations", () => {
  it("enforces explicit scope and sane tallies", async () => {
    const { classId, sessionId, tokens } = await setup();
    const base = { sessionId, conceptId: "liquidity" as const, groupId: null, category: "other", supports: null, note: "n", observedOn: "2026-11-24", tally: null, denominator: null };
    await expect(store.addObservation(A, classId, { ...base, scope: "individual", learnerId: null })).rejects.toThrow();
    await expect(store.addObservation(A, classId, { ...base, scope: "class", learnerId: null, tally: 30, denominator: 24 })).rejects.toThrow();
    await store.addObservation(A, classId, { ...base, scope: "individual", learnerId: tokens[0].learnerId });
    await store.addObservation(A, classId, { ...base, scope: "class", learnerId: null, tally: 10, denominator: 24 });
    const b = (await store.getClassBundle(A, classId))!;
    expect(b.observations).toHaveLength(2);
  });
});

describe("class deletion", () => {
  it("removes associated evidence and revokes access", async () => {
    const { classId, tokens, checkRunId } = await setup();
    await store.setCheckRunState(A, checkRunId, "open");
    const s = await learnerSession(tokens[0].token);
    await store.submit(s, { checkRunId, submissionId: "sub-del-0001", answers });
    await store.deleteClass(A, classId);
    for (const t of ["learners", "responses", "check_runs", "sessions", "learner_sessions", "submission_receipts"]) {
      expect((store.db.prepare(`SELECT count(*) n FROM ${t}`).get() as { n: number }).n).toBe(0);
    }
    expect(await store.exchangeToken(tokens[1].token)).toBeNull();
    expect(await store.learnerContext(s)).toBeNull();
  });
});
