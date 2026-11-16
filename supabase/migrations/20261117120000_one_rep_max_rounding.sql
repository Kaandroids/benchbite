-- A one-rep max rounded as the app rounds it (#628): the weight times 30 plus the reps first, then
-- divided by 30, so that a value ending in a 5, as 37.5 kg × 7 at 46.25 kg, rounds up on both
-- sides. Dividing the reps by 30 first gave a repeating decimal just below the half, 46.2, while
-- the app gave 46.3 and called a tie a new record. Replaces one_rep_max() of
-- 20261023220000_exercise_records.sql, keeping its grants.
create or replace function public.one_rep_max(weight_kg numeric, reps integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when weight_kg is null or weight_kg <= 0 or reps is null then null
    when reps = 1 then weight_kg
    else round(weight_kg * (30 + reps) / 30.0, 1)
  end;
$$;
