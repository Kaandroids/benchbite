-- Daily targets people set themselves, and working the calculated ones out again from a new goal,
-- target weight, pace and activity (#234, ADR 0039).
--
-- New error codes:
--   BB031  a target weight that does not suit the goal: below the current weight to lose fat,
--          above it to build muscle

-- The targets a user set themselves. They are kept while the calculated ones are in use, so that
-- going back to them finds the last ones.
create table public.own_nutrition_targets (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  calories integer not null check (calories between 800 and 6000),
  protein_g integer not null check (protein_g between 0 and 500),
  carbs_g integer not null check (carbs_g between 0 and 1000),
  fat_g integer not null check (fat_g between 0 and 400),
  -- Protein, carbs and fat at 4, 4 and 9 kcal per gram may not make more than the calories,
  -- allowing 5 % or 50 kcal for rounding. Fewer is fine: the rest is left open.
  check (
    4 * protein_g + 4 * carbs_g + 9 * fat_g - calories <= greatest(50, 0.05 * calories)
  ),
  -- Whether these or the calculated targets are the ones in use.
  in_use boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.own_nutrition_targets enable row level security;

create policy "Users read their own targets"
  on public.own_nutrition_targets for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users set their own targets"
  on public.own_nutrition_targets for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users change their own targets"
  on public.own_nutrition_targets for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.own_nutrition_targets from anon;
revoke insert, update, delete, truncate on public.own_nutrition_targets from authenticated;
grant insert (calories, protein_g, carbs_g, fat_g, in_use)
  on public.own_nutrition_targets to authenticated;
grant update (calories, protein_g, carbs_g, fat_g, in_use)
  on public.own_nutrition_targets to authenticated;

create trigger own_nutrition_targets_updated_at
  before update on public.own_nutrition_targets
  for each row execute function extensions.moddatetime(updated_at);

-- The caller's targets as the app works them out from their profile, goal and latest weight,
-- whether or not they use their own. Null before the onboarding is saved.
create function public.calculated_nutrition_targets()
returns public.nutrition_targets
language sql
stable
set search_path = ''
as $$
  select public.calculate_nutrition_targets(
    sex => p.sex,
    age => public.age_in_years(p.birth_year),
    height_cm => p.height_cm,
    weight_kg => w.weight_kg,
    activity_level => p.activity_level,
    training_days_per_week => cardinality(p.training_days),
    goal => g.kind,
    target_weight_kg => g.target_weight_kg,
    weekly_pace_kg => g.weekly_pace_kg,
    pregnant_or_breastfeeding => p.pregnant_or_breastfeeding
  )
  from public.profiles p
  join public.goals g on g.user_id = p.user_id
  cross join lateral (
    select e.weight_kg
    from public.weight_entries e
    where e.user_id = p.user_id
    order by e.measured_on desc, e.id desc
    limit 1
  ) w
  where p.user_id = (select auth.uid());
$$;

-- The caller's targets in use: their own when they set them and use them, else the calculated
-- ones. Everything that measures a day against the targets reads this.
create or replace function public.my_nutrition_targets()
returns public.nutrition_targets
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (
      select row(o.calories, o.protein_g, o.carbs_g, o.fat_g)::public.nutrition_targets
      from public.own_nutrition_targets o
      where o.user_id = (select auth.uid()) and o.in_use
    ),
    public.calculated_nutrition_targets()
  );
$$;

-- The targets a new goal, target weight, pace and activity would give the caller, with their
-- profile and latest weight, before they are saved. Null before the onboarding is saved.
create function public.preview_nutrition_targets(
  goal public.goal_kind,
  target_weight_kg numeric,
  weekly_pace_kg numeric,
  activity_level public.activity_level
)
returns public.nutrition_targets
language sql
stable
set search_path = ''
as $$
  select public.calculate_nutrition_targets(
    sex => p.sex,
    age => public.age_in_years(p.birth_year),
    height_cm => p.height_cm,
    weight_kg => w.weight_kg,
    activity_level => preview_nutrition_targets.activity_level,
    training_days_per_week => cardinality(p.training_days),
    goal => preview_nutrition_targets.goal,
    target_weight_kg => preview_nutrition_targets.target_weight_kg,
    weekly_pace_kg => preview_nutrition_targets.weekly_pace_kg,
    pregnant_or_breastfeeding => p.pregnant_or_breastfeeding
  )
  from public.profiles p
  cross join lateral (
    select e.weight_kg
    from public.weight_entries e
    where e.user_id = p.user_id
    order by e.measured_on desc, e.id desc
    limit 1
  ) w
  where p.user_id = (select auth.uid());
$$;

-- Saves a new goal, target weight, pace and activity in one step, and puts the calculated targets
-- back in use. A target weight and a pace belong only to goals that change the weight, and the
-- target has to lie in the goal's direction from the latest weight. Runs as the caller, so the
-- column grants and policies of goals and profiles apply.
create function public.recalculate_nutrition_targets(
  goal public.goal_kind,
  target_weight_kg numeric,
  weekly_pace_kg numeric,
  activity_level public.activity_level
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  changes_weight boolean := recalculate_nutrition_targets.goal in ('lose_fat', 'build_muscle');
  current_kg numeric;
begin
  if changes_weight
    and (recalculate_nutrition_targets.target_weight_kg is null
      or recalculate_nutrition_targets.weekly_pace_kg is null) then
    raise exception 'A goal that changes the weight needs a target and a pace'
      using errcode = '22023';
  end if;
  select e.weight_kg into current_kg
  from public.weight_entries e
  where e.user_id = caller_id
  order by e.measured_on desc, e.id desc
  limit 1;
  if (recalculate_nutrition_targets.goal = 'lose_fat'
      and recalculate_nutrition_targets.target_weight_kg >= current_kg)
    or (recalculate_nutrition_targets.goal = 'build_muscle'
      and recalculate_nutrition_targets.target_weight_kg <= current_kg) then
    raise exception 'The target weight does not suit the goal' using errcode = 'BB031';
  end if;

  update public.goals g
  set kind = recalculate_nutrition_targets.goal,
    target_weight_kg = case when changes_weight
      then recalculate_nutrition_targets.target_weight_kg end,
    weekly_pace_kg = case when changes_weight
      then recalculate_nutrition_targets.weekly_pace_kg end
  where g.user_id = caller_id;
  if not found then
    raise exception 'No goal to change before the onboarding is saved' using errcode = 'P0002';
  end if;
  update public.profiles p
  set activity_level = recalculate_nutrition_targets.activity_level
  where p.user_id = caller_id;
  update public.own_nutrition_targets o set in_use = false where o.user_id = caller_id;
end;
$$;

revoke execute on function public.calculated_nutrition_targets() from public, anon;
grant execute on function public.calculated_nutrition_targets() to authenticated;
revoke execute on function public.preview_nutrition_targets(
  public.goal_kind, numeric, numeric, public.activity_level
) from public, anon;
grant execute on function public.preview_nutrition_targets(
  public.goal_kind, numeric, numeric, public.activity_level
) to authenticated;
revoke execute on function public.recalculate_nutrition_targets(
  public.goal_kind, numeric, numeric, public.activity_level
) from public, anon;
grant execute on function public.recalculate_nutrition_targets(
  public.goal_kind, numeric, numeric, public.activity_level
) to authenticated;
