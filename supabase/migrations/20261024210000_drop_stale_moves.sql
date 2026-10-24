-- A move that no longer fits the plan is ignored by the app (ADR 0028), but its row would still
-- hold its target day, so a move to that day would be refused and the stale move could not be
-- undone. When a workout's weekdays change or it is archived, this week's and later moves that no
-- longer fit are deleted: those from a day the workout is no longer on, and those to a day it is
-- now on that did not move away itself. The week allows a day of leeway for the device's time zone.
create function public.drop_stale_moves()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.workout_moves m
  where m.workout_id = new.id
    and m.from_on >= date_trunc('week', current_date - 1)::date
    and (
      not new.active
      or not extract(isodow from m.from_on)::smallint = any(new.weekdays)
      or (
        extract(isodow from m.to_on)::smallint = any(new.weekdays)
        and not exists (
          select 1 from public.workout_moves o
          where o.workout_id = m.workout_id and o.from_on = m.to_on
        )
      )
    );
  return null;
end;
$$;

revoke execute on function public.drop_stale_moves() from public, anon, authenticated;

create trigger workouts_drop_stale_moves
  after update of weekdays, active on public.workouts
  for each row
  when (old.weekdays is distinct from new.weekdays or old.active is distinct from new.active)
  execute function public.drop_stale_moves();
