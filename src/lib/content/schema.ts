import type { ConceptId, Phase } from "@/lib/domain/types";

export interface Option {
  id: string;
  text: string;
}

export interface TeacherOnly {
  expected_answer_id: string;
  expected_reason_id: string;
  reason_interpretations: Record<string, string>;
  rationale: string;
}

/** Full item including teacher-only key. Server/teacher use only. */
export interface FullItem {
  id: string;
  version: number;
  concept_id: ConceptId;
  phase_role: "anchor" | "recheck";
  context: string;
  scenario: string;
  question: string;
  answer_options: Option[];
  reason_prompt: string;
  reason_options: Option[];
  teacher_only: TeacherOnly;
  optional_confidence: string[];
  access_support: string;
}

/** What a student device receives. No key, no mappings, no rationale. */
export interface StudentItem {
  id: string;
  version: number;
  scenario: string;
  question: string;
  answerOptions: { id: string; letter: string; text: string }[];
  reasonPrompt: string;
  reasonOptions: { id: string; letter: string; text: string }[];
}

export interface ActivityStep {
  minutes: number;
  teacher_says: string;
  action: string;
}

export interface Activity {
  id: string;
  title: string;
  minutes: number;
  materials: string[];
  steps: ActivityStep[];
  expected_reasoning: string;
  scaffold: string;
  extension: string;
  printable_student_material: {
    title: string;
    cards?: string[];
    mat_labels?: string[];
    scenario_cards?: string[];
    worksheet_prompts: string[];
  };
}

export interface Module {
  id: ConceptId;
  title: string;
  curriculum_day: number;
  goal: string;
  success_criterion: string;
  illustration_direction: string;
  anchor_item_ids: string[];
  recheck_item_ids: string[];
  activity: Activity;
}

export interface LearningContent {
  content_version: string;
  status: string;
  grade_band: string;
  modules: Module[];
  items: FullItem[];
  review_rubric: Record<string, string>;
  suggestion_rules: Record<string, string>;
}

export function itemsForPhase(module: Module, phase: Phase): string[] {
  return phase === "recheck" ? module.recheck_item_ids : module.anchor_item_ids;
}
