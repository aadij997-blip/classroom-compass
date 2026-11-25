import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import path from "node:path";
import { randomBytes, scryptSync, timingSafeEqual, randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { SqliteStore } from "@/lib/store/sqlite";
import { SupabaseLearnerStore, SupabaseTeacherStore } from "@/lib/store/supabase";
import type { LearnerStore, TeacherStore } from "@/lib/store/types";
import { hashToken, newToken } from "@/lib/store/validate";
import { fixtureBundle } from "@/lib/demo/fixture";

export type DataMode = "demo" | "local" | "supabase";

export interface TeacherContext {
  teacherId: string;
  displayName: string;
  mode: DataMode;
  store: TeacherStore;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const supabaseConfigured = !!(SUPABASE_URL && SUPABASE_ANON);
export const realMode: Exclude<DataMode, "demo"> = supabaseConfigured ? "supabase" : "local";

export const DEMO_COOKIE = "cc_demo";
export const TEACHER_COOKIE = "cc_session";
export const LEARNER_COOKIE = "cc_learner";
const secure = process.env.NODE_ENV === "production";

// ------------------------------------------------------------ store singletons
const g = globalThis as unknown as { __ccDemo?: SqliteStore; __ccLocal?: SqliteStore };

/** Isolated, in-memory sample-class store. Resets when the server restarts. */
export function demoStore(): SqliteStore {
  g.__ccDemo ??= new SqliteStore(":memory:", "s-");
  return g.__ccDemo;
}

/** Local trial store on this computer only. */
export function localStore(): SqliteStore {
  g.__ccLocal ??= new SqliteStore(process.env.COMPASS_SQLITE_PATH || path.join(process.cwd(), ".data", "compass.sqlite"), "c-");
  return g.__ccLocal;
}

// ------------------------------------------------------------------ demo
const DEMO_ID = /^[A-Za-z0-9_-]{16,40}$/;
const MAX_DEMO_WORKSPACES = 200;

export function demoTeacherId(ws: string) {
  return `demo:${ws}`;
}

export function seedDemo(ws: string) {
  const store = demoStore();
  const teacherId = demoTeacherId(ws);
  store.deleteTeacherData(teacherId);
  store.importBundle(fixtureBundle(`${ws}.`, teacherId));
  store.db.prepare("INSERT OR REPLACE INTO demo_workspaces (id, created_at) VALUES (?, ?)").run(ws, new Date().toISOString());
  // Keep memory bounded: drop the oldest sample workspaces.
  const extra = store.db.prepare("SELECT id FROM demo_workspaces ORDER BY created_at DESC LIMIT -1 OFFSET ?").all(MAX_DEMO_WORKSPACES) as { id: string }[];
  for (const { id } of extra) {
    store.deleteTeacherData(demoTeacherId(id));
    store.db.prepare("DELETE FROM demo_workspaces WHERE id = ?").run(id);
  }
}

export function newDemoWorkspace(): string {
  const ws = randomBytes(15).toString("base64url");
  seedDemo(ws);
  return ws;
}

function demoExists(ws: string) {
  return !!demoStore().db.prepare("SELECT 1 FROM demo_workspaces WHERE id = ?").get(ws);
}

// ------------------------------------------------------------- local auth
function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, 64);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}
function checkPassword(pw: string, stored: string) {
  const [, saltHex, hashHex] = stored.split(":");
  const hash = scryptSync(pw, Buffer.from(saltHex, "hex"), 64);
  return timingSafeEqual(hash, Buffer.from(hashHex, "hex"));
}

export async function localSignUp(email: string, password: string, displayName: string) {
  const db = localStore().db;
  const exists = db.prepare("SELECT 1 FROM teachers WHERE email = ?").get(email);
  if (exists) return { error: "An account with that email already exists on this computer. Sign in instead." };
  const id = randomUUID();
  db.prepare("INSERT INTO teachers (id, email, display_name, password_hash, created_at) VALUES (?,?,?,?,?)").run(id, email, displayName, hashPassword(password), new Date().toISOString());
  await startLocalSession(id);
  return { ok: true };
}

export async function localSignIn(email: string, password: string) {
  const db = localStore().db;
  const row = db.prepare("SELECT id, password_hash FROM teachers WHERE email = ?").get(email) as { id: string; password_hash: string } | undefined;
  if (!row || !checkPassword(password, row.password_hash)) return { error: "That email and password do not match an account on this computer." };
  await startLocalSession(row.id);
  return { ok: true };
}

async function startLocalSession(teacherId: string) {
  const token = newToken("ts_");
  const expires = new Date(Date.now() + 12 * 3600_000);
  localStore().db.prepare("INSERT INTO teacher_sessions (token_hash, teacher_id, expires_at) VALUES (?,?,?)").run(hashToken(token), teacherId, expires.toISOString());
  (await cookies()).set(TEACHER_COOKIE, token, { httpOnly: true, sameSite: "lax", secure, path: "/", expires });
}

// --------------------------------------------------------------- supabase
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL!, SUPABASE_ANON!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component; proxy.ts refreshes sessions instead.
        }
      },
    },
  });
}

export function supabaseAnon() {
  return createClient(SUPABASE_URL!, SUPABASE_ANON!, { auth: { persistSession: false, autoRefreshToken: false } });
}

// ------------------------------------------------------------ resolution
export async function getTeacher(): Promise<TeacherContext | null> {
  const jar = await cookies();
  const ws = jar.get(DEMO_COOKIE)?.value;
  if (ws && DEMO_ID.test(ws)) {
    if (!demoExists(ws)) seedDemo(ws); // server restarted: re-seed the same workspace
    return { teacherId: demoTeacherId(ws), displayName: "Sample teacher", mode: "demo", store: demoStore() };
  }
  if (supabaseConfigured) {
    const sb = await supabaseServer();
    const { data } = await sb.auth.getUser();
    if (!data.user) return null;
    const name = (data.user.user_metadata?.display_name as string) || data.user.email?.split("@")[0] || "Teacher";
    return { teacherId: data.user.id, displayName: name, mode: "supabase", store: new SupabaseTeacherStore(sb) };
  }
  const token = jar.get(TEACHER_COOKIE)?.value;
  if (!token) return null;
  const row = localStore()
    .db.prepare("SELECT t.id, t.display_name FROM teacher_sessions s JOIN teachers t ON t.id = s.teacher_id WHERE s.token_hash = ? AND s.expires_at > ?")
    .get(hashToken(token), new Date().toISOString()) as { id: string; display_name: string } | undefined;
  if (!row) return null;
  return { teacherId: row.id, displayName: row.display_name, mode: "local", store: localStore() };
}

export async function requireTeacher(): Promise<TeacherContext> {
  const t = await getTeacher();
  if (!t) redirect("/");
  return t;
}

export async function signOutEverywhere() {
  const jar = await cookies();
  const token = jar.get(TEACHER_COOKIE)?.value;
  if (token) localStore().db.prepare("DELETE FROM teacher_sessions WHERE token_hash = ?").run(hashToken(token));
  jar.delete(TEACHER_COOKIE);
  jar.delete(DEMO_COOKIE);
  if (supabaseConfigured) await (await supabaseServer()).auth.signOut();
}

// ------------------------------------------------------------ learners
export function learnerStoreForToken(token: string): { store: LearnerStore; kind: "demo" | "main" } {
  if (token.startsWith("s-")) return { store: demoStore(), kind: "demo" };
  return { store: supabaseConfigured ? new SupabaseLearnerStore(supabaseAnon()) : localStore(), kind: "main" };
}

export async function learnerSession(): Promise<{ store: LearnerStore; session: string; kind: "demo" | "main" } | null> {
  const raw = (await cookies()).get(LEARNER_COOKIE)?.value;
  if (!raw) return null;
  const [kind, session] = raw.split(".", 2);
  if (!session || (kind !== "demo" && kind !== "main")) return null;
  const store = kind === "demo" ? demoStore() : supabaseConfigured ? new SupabaseLearnerStore(supabaseAnon()) : localStore();
  return { store, session, kind };
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "local").trim();
}

export { secure as secureCookies };
