-- 0005: parent linking (link-code flow) + night exam market.
-- Run AFTER 0004 in Supabase SQL editor. Safe to re-run (IF NOT EXISTS / OR REPLACE).
-- NOTE: user needs to run this in the Supabase SQL editor; until then the
-- /parent and /market pages show a friendly "database update needed" banner.

-- ---------- parent linking ----------
create table if not exists parent_links (
  code text primary key,
  child_id uuid not null references players(id),
  parent_id uuid references players(id),
  created_at timestamptz default now()
);
create index if not exists parent_links_child_idx on parent_links(child_id);
create index if not exists parent_links_parent_idx on parent_links(parent_id);

-- ---------- night exam market ----------
create table if not exists market_posts (
  id uuid primary key default gen_random_uuid(),
  poster_id uuid not null references players(id),
  problem_latex text not null,
  answer_numeric double precision not null,
  tolerance double precision not null default 0.001,
  skill_tag text not null,
  bounty integer not null check (bounty between 5 and 50),
  status text not null default 'OPEN' check (status in ('OPEN', 'CLAIMED')),
  created_at timestamptz default now()
);
create index if not exists market_posts_status_idx on market_posts(status);
create index if not exists market_posts_poster_idx on market_posts(poster_id);

create table if not exists market_claims (
  post_id uuid primary key references market_posts(id),
  solver_id uuid not null references players(id),
  created_at timestamptz default now()
);

-- Atomic escrow: checks poster XP, deducts bounty, inserts the post.
-- Returns the new post id, or raises on insufficient XP / bad input.
create or replace function post_bounty(
  p_poster uuid, p_problem text, p_answer double precision,
  p_tolerance double precision, p_skill text, p_bounty int
)
returns uuid
language plpgsql as $$
declare
  v_xp int;
  v_id uuid;
begin
  if p_bounty < 5 or p_bounty > 50 then raise exception 'bad bounty'; end if;
  if p_problem is null or length(p_problem) < 1 then raise exception 'empty problem'; end if;
  select p.xp into v_xp from players p where p.id = p_poster for update;
  if not found then raise exception 'player not found'; end if;
  if v_xp < p_bounty then raise exception 'insufficient xp'; end if;
  update players p set xp = v_xp - p_bounty where p.id = p_poster;
  insert into market_posts (poster_id, problem_latex, answer_numeric, tolerance, skill_tag, bounty)
  values (p_poster, p_problem, p_answer, greatest(p_tolerance, 0.000001), p_skill, p_bounty)
  returning id into v_id;
  return v_id;
end $$;

-- Atomic claim: verifies answer, pays the FIRST solver only, blocks self-claim.
create or replace function claim_bounty(p_post uuid, p_solver uuid, p_answer double precision)
returns table (ok boolean, reason text, bounty int)
language plpgsql as $$
declare
  v_status text;
  v_poster uuid;
  v_answer double precision;
  v_tol double precision;
  v_bounty int;
begin
  select m.status, m.poster_id, m.answer_numeric, m.tolerance, m.bounty
    into v_status, v_poster, v_answer, v_tol, v_bounty
    from market_posts m where m.id = p_post for update;
  if not found then ok := false; reason := 'not found'; bounty := 0; return next; return; end if;
  if v_status != 'OPEN' then ok := false; reason := 'already claimed'; bounty := 0; return next; return; end if;
  if v_poster = p_solver then ok := false; reason := 'own post'; bounty := 0; return next; return; end if;
  if p_solver is null then ok := false; reason := 'unknown solver'; bounty := 0; return next; return; end if;
  if abs(p_answer - v_answer) > greatest(v_tol, 0.000001) then
    ok := false; reason := 'wrong answer'; bounty := 0; return next; return;
  end if;
  update market_posts m set status = 'CLAIMED' where m.id = p_post;
  insert into market_claims (post_id, solver_id) values (p_post, p_solver);
  update players p set xp = p.xp + v_bounty where p.id = p_solver;
  ok := true; reason := 'ok'; bounty := v_bounty; return next;
end $$;

-- ---------- RLS (demo-open, same as 0001) ----------
alter table parent_links enable row level security;
alter table market_posts enable row level security;
alter table market_claims enable row level security;

drop policy if exists open_all on parent_links;
drop policy if exists open_all on market_posts;
drop policy if exists open_all on market_claims;
create policy open_all on parent_links for all using (true) with check (true);
create policy open_all on market_posts for all using (true) with check (true);
create policy open_all on market_claims for all using (true) with check (true);
