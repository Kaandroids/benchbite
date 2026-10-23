-- The caller's best value of each kind of record for several exercises at once, loaded when a
-- workout starts so that new records can be noticed while logging, also without a connection
-- (#36, ADR 0025). Runs with the caller's rights, like exercise_records().
create function public.exercise_bests(exercise_ids text[])
returns table (exercise_id text, kind text, value numeric)
language sql
stable
set search_path = ''
as $$
  select x.id, r.kind, r.value
  from unnest(exercise_bests.exercise_ids) as x (id)
  cross join lateral public.exercise_records(x.id) as r;
$$;

revoke execute on function public.exercise_bests from public, anon;
grant execute on function public.exercise_bests to authenticated;
