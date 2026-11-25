-- Classroom Compass: full setup for the Supabase SQL Editor (both migrations, in order).
-- Generated from supabase/migrations/. Run once on a fresh project.

-- ===== migrations/20261124000001_classroom_compass.sql =====
-- Classroom Compass — configured classroom mode (Supabase Postgres).
-- Teachers authenticate with Supabase Auth. Every teacher-facing table is
-- protected by row-level security keyed to classes.teacher_id = auth.uid().
-- Learners never authenticate with Supabase: they call three SECURITY DEFINER
-- functions with an unguessable private token (stored only as a SHA-256 hash),
-- which is exchanged for a short-lived, hashed learner session.
-- Answer keys and interpretation mappings are NOT stored in the database; they
-- live in server-only application code.

create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------------ tables
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  grade_band text not null,
  created_at timestamptz not null default now()
);
create index classes_teacher on public.classes(teacher_id);

create table public.learners (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  alias text not null check (char_length(alias) between 1 and 40),
  position int not null check (position > 0),
  token_hash text unique check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$'),
  has_access boolean generated always as (token_hash is not null) stored,
  created_at timestamptz not null default now(),
  unique (class_id, position)
);

create table public.learner_sessions (
  token_hash text primary key,
  learner_id uuid not null references public.learners(id) on delete cascade,
  expires_at timestamptz not null
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 40)
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete cascade,
  primary key (group_id, learner_id)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  concept_id text not null check (concept_id in ('opportunity-cost','diversification','liquidity')),
  goal text not null default '',
  mode text not null check (mode in ('digital','paper','observation_only')),
  state text not null default 'collecting' check (state in ('setup','collecting','teaching')),
  created_at timestamptz not null default now()
);

-- Option IDs per item version (no keys). Seeded by the content migration.
create table public.content_items (
  item_id text not null,
  version int not null,
  concept_id text not null,
  answer_ids text[] not null,
  reason_ids text[] not null,
  primary key (item_id, version)
);

create table public.check_runs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  concept_id text not null,
  phase text not null check (phase in ('before','exit','recheck')),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 6),
  state text not null default 'draft' check (state in ('draft','open','closed')),
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  closed_at timestamptz,
  follow_up_of_action_id uuid
);
create index check_runs_class on public.check_runs(class_id);

create table public.responses (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete cascade,
  check_run_id uuid not null references public.check_runs(id) on delete cascade,
  item_id text not null,
  item_version int not null,
  answer_id text,
  reason_id text,
  confidence text check (confidence is null or confidence in ('sure','somewhat_sure','unsure')),
  explanation text check (explanation is null or char_length(explanation) <= 400),
  source text not null check (source in ('student_device','paper_entered_by_teacher')),
  revision int not null default 1,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (check_run_id, learner_id, item_id)
);
create index responses_class on public.responses(class_id);

create table public.response_revisions (
  response_id uuid not null,
  revision int not null,
  class_id uuid not null references public.classes(id) on delete cascade,
  answer_id text, reason_id text, confidence text, explanation text,
  source text not null,
  changed_at timestamptz not null default now(),
  changed_by text not null check (changed_by in ('learner','teacher')),
  primary key (response_id, revision)
);

create table public.submission_receipts (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{8,64}$'),
  learner_id uuid not null references public.learners(id) on delete cascade,
  check_run_id uuid not null references public.check_runs(id) on delete cascade,
  saved int not null,
  created_at timestamptz not null default now()
);

create table public.observations (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  concept_id text not null,
  scope text not null check (scope in ('individual','group','class')),
  learner_id uuid references public.learners(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade,
  category text not null,
  supports text,
  note text not null default '' check (char_length(note) <= 600),
  tally int,
  denominator int,
  observed_on date not null default current_date,
  created_at timestamptz not null default now(),
  check ((scope = 'individual' and learner_id is not null and group_id is null)
      or (scope = 'group' and group_id is not null and learner_id is null)
      or (scope = 'class' and learner_id is null and group_id is null)),
  check (tally is null or (tally >= 0 and (denominator is null or tally <= denominator)))
);

create table public.teacher_reviews (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  response_id uuid not null references public.responses(id) on delete cascade,
  kind text not null check (kind in ('explanation_score','interpretation_note')),
  score int check (score is null or score in (0,1,2)),
  stance text check (stance is null or stance in ('agree','disagree','context')),
  note text not null default '' check (char_length(note) <= 600),
  created_at timestamptz not null default now(),
  check (kind <> 'explanation_score' or score is not null)
);

create table public.teaching_actions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  check_run_id uuid references public.check_runs(id) on delete set null,
  activity_id text not null,
  recommendation_key text not null,
  evidence_response_ids jsonb not null default '[]',
  audience text not null check (audience in ('whole_class','small_group','individual')),
  learner_ids jsonb not null default '[]',
  group_id uuid references public.groups(id) on delete set null,
  decision text not null check (decision in ('suggested','accepted','dismissed')),
  note text not null default '',
  taught_at timestamptz,
  follow_up_check_run_id uuid references public.check_runs(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------- integrity triggers
create or replace function public.owns_class(p_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.classes c where c.id = p_class and c.teacher_id = auth.uid());
$$;

-- Child rows must reference parents in the same class.
create or replace function public.check_same_class() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'check_runs' then
    if not exists (select 1 from sessions s where s.id = new.session_id and s.class_id = new.class_id) then
      raise exception 'session/class mismatch';
    end if;
  elsif tg_table_name = 'group_members' then
    if not exists (select 1 from groups g join learners l on l.class_id = g.class_id
                   where g.id = new.group_id and l.id = new.learner_id) then
      raise exception 'group/learner class mismatch';
    end if;
  elsif tg_table_name = 'observations' then
    if new.learner_id is not null and not exists (select 1 from learners where id = new.learner_id and class_id = new.class_id) then
      raise exception 'learner/class mismatch';
    end if;
    if new.group_id is not null and not exists (select 1 from groups where id = new.group_id and class_id = new.class_id) then
      raise exception 'group/class mismatch';
    end if;
    if new.session_id is not null and not exists (select 1 from sessions where id = new.session_id and class_id = new.class_id) then
      raise exception 'session/class mismatch';
    end if;
  elsif tg_table_name = 'teacher_reviews' then
    if not exists (select 1 from responses where id = new.response_id and class_id = new.class_id) then
      raise exception 'response/class mismatch';
    end if;
  elsif tg_table_name = 'teaching_actions' then
    if not exists (select 1 from sessions where id = new.session_id and class_id = new.class_id) then
      raise exception 'session/class mismatch';
    end if;
    if exists (select 1 from jsonb_array_elements_text(new.learner_ids) x
               where not exists (select 1 from learners l where l.id = x::uuid and l.class_id = new.class_id)) then
      raise exception 'learner/class mismatch';
    end if;
  end if;
  return new;
end $$;

create trigger check_runs_same_class before insert or update on public.check_runs for each row execute function public.check_same_class();
create trigger group_members_same_class before insert or update on public.group_members for each row execute function public.check_same_class();
create trigger observations_same_class before insert or update on public.observations for each row execute function public.check_same_class();
create trigger reviews_same_class before insert or update on public.teacher_reviews for each row execute function public.check_same_class();
create trigger actions_same_class before insert or update on public.teaching_actions for each row execute function public.check_same_class();

-- Responses: validate class, assignment, item version, options, and run state.
-- Keep a revision history on every change.
create or replace function public.responses_validate() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
  ci record;
begin
  select * into r from check_runs where id = new.check_run_id;
  if r is null or r.class_id <> new.class_id then raise exception 'check/class mismatch'; end if;
  if r.state = 'closed' then raise exception 'check closed' using errcode = 'P0001'; end if;
  if not exists (select 1 from learners where id = new.learner_id and class_id = new.class_id) then
    raise exception 'learner/class mismatch';
  end if;
  if not exists (select 1 from jsonb_array_elements(r.items) x
                 where x->>'itemId' = new.item_id and (x->>'version')::int = new.item_version) then
    raise exception 'item not in check';
  end if;
  select * into ci from content_items where item_id = new.item_id and version = new.item_version;
  if ci is null then raise exception 'unknown item version'; end if;
  if new.answer_id is not null and not (new.answer_id = any (ci.answer_ids)) then raise exception 'unknown answer'; end if;
  if new.reason_id is not null and not (new.reason_id = any (ci.reason_ids)) then raise exception 'unknown reason'; end if;
  if tg_op = 'UPDATE' then
    if (new.answer_id, new.reason_id, new.confidence, new.explanation, new.source)
       is not distinct from (old.answer_id, old.reason_id, old.confidence, old.explanation, old.source) then
      return null; -- no-op update: do not bump revision
    end if;
    insert into response_revisions (response_id, revision, class_id, answer_id, reason_id, confidence, explanation, source, changed_by)
    values (old.id, old.revision, old.class_id, old.answer_id, old.reason_id, old.confidence, old.explanation, old.source,
            coalesce(nullif(current_setting('compass.actor', true), ''), 'teacher'));
    new.revision := old.revision + 1;
    new.updated_at := now();
    new.id := old.id; new.class_id := old.class_id; new.learner_id := old.learner_id;
    new.check_run_id := old.check_run_id; new.item_id := old.item_id; new.item_version := old.item_version;
  end if;
  return new;
end $$;
create trigger responses_validate before insert or update on public.responses for each row execute function public.responses_validate();

create or replace function public.responses_archive_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- During class deletion the class row is already gone: let the cascade proceed.
  if not exists (select 1 from classes where id = old.class_id) then return old; end if;
  if exists (select 1 from check_runs where id = old.check_run_id and state = 'closed') then
    raise exception 'check closed' using errcode = 'P0001';
  end if;
  insert into response_revisions (response_id, revision, class_id, answer_id, reason_id, confidence, explanation, source, changed_by)
  values (old.id, old.revision, old.class_id, old.answer_id, old.reason_id, old.confidence, old.explanation, old.source, 'teacher')
  on conflict do nothing;
  return old;
end $$;
create trigger responses_archive_delete before delete on public.responses for each row execute function public.responses_archive_delete();

-- Rotating or revoking a learner card ends every session opened with it.
create or replace function public.learners_token_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.token_hash is distinct from old.token_hash then
    delete from learner_sessions where learner_id = new.id;
  end if;
  return new;
end $$;
create trigger learners_token_changed after update of token_hash on public.learners for each row execute function public.learners_token_changed();

-- ------------------------------------------------------------ row security
alter table public.classes enable row level security;
alter table public.learners enable row level security;
alter table public.learner_sessions enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.sessions enable row level security;
alter table public.content_items enable row level security;
alter table public.check_runs enable row level security;
alter table public.responses enable row level security;
alter table public.response_revisions enable row level security;
alter table public.submission_receipts enable row level security;
alter table public.observations enable row level security;
alter table public.teacher_reviews enable row level security;
alter table public.teaching_actions enable row level security;

create policy classes_owner on public.classes for all to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy learners_owner on public.learners for all to authenticated
  using (public.owns_class(class_id)) with check (public.owns_class(class_id));
create policy groups_owner on public.groups for all to authenticated
  using (public.owns_class(class_id)) with check (public.owns_class(class_id));
create policy group_members_owner on public.group_members for all to authenticated
  using (exists (select 1 from public.groups g where g.id = group_id and public.owns_class(g.class_id)))
  with check (exists (select 1 from public.groups g where g.id = group_id and public.owns_class(g.class_id)));
create policy sessions_owner on public.sessions for all to authenticated
  using (public.owns_class(class_id)) with check (public.owns_class(class_id));
create policy check_runs_owner on public.check_runs for all to authenticated
  using (public.owns_class(class_id)) with check (public.owns_class(class_id));
create policy responses_owner_read on public.responses for select to authenticated using (public.owns_class(class_id));
-- Teachers may only write paper-entered responses directly; device responses arrive via learner_submit().
create policy responses_owner_paper_insert on public.responses for insert to authenticated
  with check (public.owns_class(class_id) and source = 'paper_entered_by_teacher');
create policy responses_owner_paper_update on public.responses for update to authenticated
  using (public.owns_class(class_id)) with check (public.owns_class(class_id) and source = 'paper_entered_by_teacher');
create policy responses_owner_delete on public.responses for delete to authenticated using (public.owns_class(class_id));
create policy revisions_owner_read on public.response_revisions for select to authenticated using (public.owns_class(class_id));
create policy observations_owner on public.observations for all to authenticated
  using (public.owns_class(class_id)) with check (public.owns_class(class_id));
create policy reviews_owner on public.teacher_reviews for all to authenticated
  using (public.owns_class(class_id)) with check (public.owns_class(class_id));
create policy actions_owner on public.teaching_actions for all to authenticated
  using (public.owns_class(class_id)) with check (public.owns_class(class_id));
create policy content_items_read on public.content_items for select to authenticated using (true);
-- learner_sessions and submission_receipts: no policies → no direct access.

-- Explicit table privileges (works whether or not the project auto-grants new
-- tables to the Data API). RLS policies above still decide which rows are visible.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.classes, public.groups, public.group_members,
  public.sessions, public.check_runs, public.observations, public.teacher_reviews,
  public.teaching_actions to authenticated;
grant select, insert, update, delete on public.responses to authenticated;
grant select on public.response_revisions, public.content_items to authenticated;

-- Teachers can see whether a learner has access, but never the token hash.
revoke all on public.learners from anon, authenticated;
grant select (id, class_id, alias, position, has_access, created_at) on public.learners to authenticated;
grant insert (id, class_id, alias, position, token_hash) on public.learners to authenticated;
grant update (token_hash, alias) on public.learners to authenticated;
grant delete on public.learners to authenticated;
revoke all on public.learner_sessions, public.submission_receipts from anon, authenticated;
revoke all on public.classes, public.groups, public.group_members, public.sessions, public.check_runs,
  public.responses, public.response_revisions, public.observations, public.teacher_reviews,
  public.teaching_actions, public.content_items from anon;

-- ------------------------------------------------------- learner functions
create or replace function public.learner_exchange(p_token text)
returns table (session_token text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  l_id uuid;
  s text;
  e timestamptz := now() + interval '3 hours';
begin
  if p_token is null or char_length(p_token) > 80 then return; end if;
  select id into l_id from learners where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if l_id is null then return; end if;
  delete from learner_sessions where learner_sessions.expires_at < now();
  s := 'ls_' || translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
  insert into learner_sessions (token_hash, learner_id, expires_at) values (encode(extensions.digest(s, 'sha256'), 'hex'), l_id, e);
  return query select s, e;
end $$;

create or replace function public.learner_from_session(p_session text)
returns public.learners
language sql stable security definer set search_path = public as $$
  select l.* from learner_sessions s join learners l on l.id = s.learner_id
  where s.token_hash = encode(extensions.digest(p_session, 'sha256'), 'hex') and s.expires_at > now() and l.token_hash is not null;
$$;
revoke all on function public.learner_from_session(text) from public, anon, authenticated;

create or replace function public.learner_context(p_session text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  l learners;
begin
  l := learner_from_session(p_session);
  if l.id is null then return null; end if;
  return jsonb_build_object(
    'learnerId', l.id,
    'alias', l.alias,
    'openRuns', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'conceptId', r.concept_id, 'phase', r.phase, 'items', r.items) order by r.opened_at desc)
                          from check_runs r where r.class_id = l.class_id and r.state = 'open'), '[]'::jsonb),
    'responses', coalesce((select jsonb_agg(jsonb_build_object('checkRunId', x.check_run_id, 'itemId', x.item_id, 'answerId', x.answer_id,
                                   'reasonId', x.reason_id, 'confidence', x.confidence, 'explanation', x.explanation))
                           from responses x join check_runs r on r.id = x.check_run_id
                           where x.learner_id = l.id and r.state = 'open'), '[]'::jsonb)
  );
end $$;

create or replace function public.learner_submit(p_session text, p_check_run uuid, p_submission_id text, p_answers jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l learners;
  r check_runs;
  a jsonb;
  ver int;
  saved int := 0;
  prior submission_receipts;
  n int;
begin
  l := learner_from_session(p_session);
  if l.id is null then raise exception 'session expired' using errcode = '28000'; end if;
  if p_submission_id !~ '^[A-Za-z0-9_-]{8,64}$' then raise exception 'invalid submission' using errcode = '22023'; end if;
  select * into r from check_runs where id = p_check_run;
  if r.id is null or r.class_id <> l.class_id then raise exception 'not available' using errcode = 'P0002'; end if;
  if r.state <> 'open' then raise exception 'check closed' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) = 0
     or jsonb_array_length(p_answers) > jsonb_array_length(r.items) then
    raise exception 'invalid answers' using errcode = '22023';
  end if;
  select * into prior from submission_receipts where id = p_submission_id;
  if prior.id is not null then
    if prior.learner_id <> l.id then raise exception 'invalid submission' using errcode = '22023'; end if;
    return jsonb_build_object('saved', prior.saved, 'duplicate', true);
  end if;
  perform set_config('compass.actor', 'learner', true);
  for a in select * from jsonb_array_elements(p_answers) loop
    select (x->>'version')::int into ver from jsonb_array_elements(r.items) x where x->>'itemId' = a->>'itemId';
    if ver is null then raise exception 'item not in check' using errcode = '22023'; end if;
    insert into responses (class_id, learner_id, check_run_id, item_id, item_version, answer_id, reason_id, confidence, explanation, source)
    values (l.class_id, l.id, r.id, a->>'itemId', ver, a->>'answerId', a->>'reasonId', a->>'confidence',
            left(nullif(btrim(a->>'explanation'), ''), 400), 'student_device')
    on conflict (check_run_id, learner_id, item_id) do update
      set answer_id = excluded.answer_id, reason_id = excluded.reason_id, confidence = excluded.confidence,
          explanation = excluded.explanation, source = excluded.source;
    get diagnostics n = row_count;
    saved := saved + n;
  end loop;
  insert into submission_receipts (id, learner_id, check_run_id, saved) values (p_submission_id, l.id, r.id, saved);
  return jsonb_build_object('saved', saved, 'duplicate', false);
end $$;

revoke all on function public.learner_exchange(text), public.learner_context(text), public.learner_submit(text, uuid, text, jsonb) from public;
grant execute on function public.learner_exchange(text), public.learner_context(text), public.learner_submit(text, uuid, text, jsonb) to anon, authenticated;
revoke all on function public.owns_class(uuid) from public, anon;
grant execute on function public.owns_class(uuid) to authenticated;

-- ===== migrations/20261124000002_content_items.sql =====
-- Generated by scripts/generate-content-seed.mjs from content pilot-1.1.
-- Option IDs only. Answer keys and mappings stay in server-only application code.
insert into public.content_items (item_id, version, concept_id, answer_ids, reason_ids) values
  ('oc-anchor-01', 1, 'opportunity-cost', array['a','b','c','d'], array['r1','r2','r3','r4']),
  ('oc-anchor-02', 1, 'opportunity-cost', array['a','b','c','d'], array['r1','r2','r3','r4']),
  ('oc-recheck-01', 1, 'opportunity-cost', array['a','b','c','d'], array['r1','r2','r3','r4']),
  ('oc-recheck-02', 2, 'opportunity-cost', array['a','b','c','d'], array['r1','r2','r3','r4']),
  ('div-anchor-01', 1, 'diversification', array['a','b','c','d'], array['r1','r2','r3','r4']),
  ('div-anchor-02', 1, 'diversification', array['a','b','c','d'], array['r1','r2','r3','r4']),
  ('div-recheck-01', 1, 'diversification', array['a','b','c','d'], array['r1','r2','r3','r4']),
  ('div-recheck-02', 1, 'diversification', array['a','b','c','d'], array['r1','r2','r3','r4']),
  ('liq-anchor-01', 1, 'liquidity', array['a','b','c','d'], array['r1','r2','r3','r4']),
  ('liq-anchor-02', 1, 'liquidity', array['a','b','c','d'], array['r1','r2','r3','r4']),
  ('liq-recheck-01', 1, 'liquidity', array['a','b','c','d'], array['r1','r2','r3','r4']),
  ('liq-recheck-02', 1, 'liquidity', array['a','b','c','d'], array['r1','r2','r3','r4'])
on conflict (item_id, version) do update set answer_ids = excluded.answer_ids, reason_ids = excluded.reason_ids;
