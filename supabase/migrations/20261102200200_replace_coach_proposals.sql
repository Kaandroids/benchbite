-- A newer proposal replaces the ones of its kind still pending in the same thread whose workouts it
-- all changes too (#402, ADR 0077), as when Bite proposes again what it left out: only the last
-- can then be applied, and the cards before it say they were replaced. One that changes other
-- workouts as well, or is of another kind, as an alternative beside a change, stays, so that no
-- change is lost: the newer one could not hold it. A change to one workout (`workout`) and to
-- several (`workouts`) are one kind. Workouts are matched as decide_coach_proposal() locks them
-- (coach_proposal_workout_ids()).
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
    and (p.kind = new.kind or (p.kind in ('workout', 'workouts') and new.kind in ('workout', 'workouts')))
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
