-- M5: invite rewards. Pair PK makes claims idempotent (no double +50 XP).
create table invite_claims (
  inviter_id uuid references players(id),
  invitee_id uuid references players(id),
  created_at timestamptz default now(),
  primary key (inviter_id, invitee_id)
);

create or replace function claim_invite(p_inviter uuid, p_invitee uuid)
returns table (awarded boolean, invitee_xp int)
language plpgsql as $$
declare v_new boolean := false;
begin
  if p_inviter is null or p_invitee is null or p_inviter = p_invitee then
    awarded := false;
    select p.xp into invitee_xp from players p where p.id = p_invitee;
    return next; return;
  end if;
  perform 1 from players p where p.id = p_inviter;
  if not found then
    awarded := false;
    select p.xp into invitee_xp from players p where p.id = p_invitee;
    return next; return;
  end if;
  insert into invite_claims(inviter_id, invitee_id) values (p_inviter, p_invitee)
  on conflict do nothing;
  if found then
    update players p set xp = p.xp + 50 where p.id in (p_inviter, p_invitee);
    v_new := true;
  end if;
  awarded := v_new;
  select p.xp into invitee_xp from players p where p.id = p_invitee;
  return next; return;
end $$;

alter table invite_claims enable row level security;
create policy open_all on invite_claims for all using (true) with check (true);