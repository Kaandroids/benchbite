-- A newer proposal replaces the ones still pending in the same thread whose workouts it all
-- changes too (#402, ADR 0077), as when Bite proposes again what it left out: only the last can
-- then be applied, and the cards before it say they were replaced. One that changes other
-- workouts as well stays, so that no change is lost. Workouts are matched as
-- decide_coach_proposal() locks them (coach_proposal_workout_ids()).
create function public.replace_coach_proposals()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.coach_proposals p
  set status = 'replaced', decided_at = now()
  where p.thread_id = new.thread_id
    and p.user_id = new.user_id
    and p.status = 'pending'
    and p.id <> new.id
    and cardinality(public.coach_proposal_workout_ids(p.kind, p.change)) > 0
    and public.coach_proposal_workout_ids(p.kind, p.change)
      <@ public.coach_proposal_workout_ids(new.kind, new.change);
  return null;
end;
$$;

create trigger replace_coach_proposals
after insert on public.coach_proposals
for each row execute function public.replace_coach_proposals();

revoke all on function public.replace_coach_proposals() from public, anon, authenticated;
