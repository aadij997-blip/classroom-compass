"use server";

import { z } from "zod";
import { learnerSession, clientIp } from "@/lib/server/context";
import { allow, LIMITS } from "@/lib/server/rate-limit";
import { hashToken } from "@/lib/store/validate";
import { StoreError } from "@/lib/store/types";
import { CONFIDENCE_VALUES } from "@/lib/domain/types";
import { getItem, lettersToIds } from "@/lib/content";

const Input = z.object({
  checkRunId: z.string().min(1).max(80),
  submissionId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  answers: z
    .array(
      z.object({
        itemId: z.string().min(1).max(40),
        answerId: z.string().max(8).nullable(),
        reasonId: z.string().max(8).nullable(),
        confidence: z.enum(CONFIDENCE_VALUES).nullable(),
        explanation: z.string().max(400).nullable(),
      }),
    )
    .min(1)
    .max(6),
});

export type SubmitResult = { ok: true; saved: number; duplicate: boolean } | { ok: false; code: string; message: string };

export async function submitAnswers(raw: unknown): Promise<SubmitResult> {
  const s = await learnerSession();
  if (!s) return { ok: false, code: "forbidden", message: "Your link has expired. Open the link on your card again." };
  const ip = await clientIp();
  if (!allow(`submit-ip:${ip}`, LIMITS.submitPerIp.limit, LIMITS.submitPerIp.windowMs) || !allow(`submit:${hashToken(s.session)}`, LIMITS.submitPerLearner.limit, LIMITS.submitPerLearner.windowMs)) {
    return { ok: false, code: "rate_limited", message: "Lots of answers arriving at once — wait a few seconds and press Try again." };
  }
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "invalid", message: "Something about that answer didn’t look right. Please try again." };
  try {
    // Devices send displayed letters; map them to stable option IDs for this run.
    const ctx = await s.store.learnerContext(s.session);
    const run = ctx?.openRuns.find((r) => r.id === parsed.data.checkRunId);
    if (!ctx) return { ok: false, code: "forbidden", message: "Your link has expired. Open the link on your card again." };
    if (!run) return { ok: false, code: "closed", message: "This check is closed. Your teacher has stopped collecting answers." };
    const answers = [];
    for (const a of parsed.data.answers) {
      const ref = run.items.find((i) => i.itemId === a.itemId);
      if (!ref) return { ok: false, code: "invalid", message: "Something about that answer didn’t look right. Please try again." };
      const ids = lettersToIds(run.id, getItem(ref.itemId, ref.version)!, a.answerId, a.reasonId);
      if (ids.answerId === undefined || ids.reasonId === undefined) return { ok: false, code: "invalid", message: "Something about that answer didn’t look right. Please try again." };
      answers.push({ ...a, answerId: ids.answerId, reasonId: ids.reasonId });
    }
    const res = await s.store.submit(s.session, { ...parsed.data, answers });
    return { ok: true, ...res };
  } catch (e) {
    if (e instanceof StoreError) return { ok: false, code: e.code, message: e.message };
    return { ok: false, code: "unavailable", message: "Your answers were not saved. Check your connection and press Try again." };
  }
}
