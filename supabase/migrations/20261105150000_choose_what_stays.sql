-- A user chooses once what stays when premium ends (#411, ADR 0083): `applied_plans.choice_open`
-- says the choice is theirs to make, apply_plan_limits() opens and closes it, and
-- choose_what_stays() makes it. Until then the ones last trained or used stay, as before.
-- New error codes:
--   BB055  the user has no choice to make, as they have made it or nothing waits
--   BB056  what was chosen does not fit the plan

alter table public.applied_plans add column choice_open boolean not null default false;

-- Whether `owner` has anything to choose between: an active workout or the alternative of a usable
-- one that waits. What is in the archive waits on such a plan but is not among the choices.
create function public.has_waiting_choices(owner uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.workouts w
    where w.user_id = has_waiting_choices.owner and w.active and w.held
  ) or exists (
    select 1 from public.workout_alternatives a
    join public.workouts w on w.id = a.workout_id
    where a.user_id = has_waiting_choices.owner and w.active and not w.held
      and a.held and a.exercises is not null
  );
$$;

-- As before (20261103090000), and the choice opens when a plan with more room ends and something
-- waits. It stays open until it is made or nothing waits, and only the end of a plan opens it again.
create or replace function public.apply_plan_limits(owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  limits public.plans;
  last_applied public.applied_plans;
  had_more_room boolean;
begin
  -- The plan is read under the lock, so that one applied while this waited is not undone.
  perform public.lock_user_limits(apply_plan_limits.owner);
  limits := public.plan_limits(apply_plan_limits.owner);
  select a.* into last_applied from public.applied_plans a
  where a.user_id = apply_plan_limits.owner;
  -- More room of any kind, as any of them may leave something waiting; null is no limit.
  had_more_room := (
    select p.workouts > limits.workouts
      or p.versions > limits.versions
      or (p.added_alternatives is null and limits.added_alternatives is not null)
      or p.added_alternatives > limits.added_alternatives
    from public.plans p where p.plan = last_applied.plan
  );
  perform public.apply_workout_limits(apply_plan_limits.owner, limits);
  perform public.apply_alternative_limits(apply_plan_limits.owner, limits);
  insert into public.applied_plans (user_id, plan, choice_open)
  values (
    apply_plan_limits.owner,
    limits.plan,
    (coalesce(last_applied.choice_open, false) or coalesce(had_more_room, false))
      and public.has_waiting_choices(apply_plan_limits.owner)
  )
  on conflict (user_id) do update
  set plan = excluded.plan, choice_open = excluded.choice_open
  where (public.applied_plans.plan, public.applied_plans.choice_open)
    is distinct from (excluded.plan, excluded.choice_open);
end;
$$;

-- As before (20261105120000), with `choice_open`, so that the app asks.
drop function public.workout_limits();
create function public.workout_limits()
returns table (
  exercises integer,
  workouts integer,
  alternatives integer,
  alternative_name_length integer,
  added_alternatives integer,
  alternatives_added integer,
  archive boolean,
  workouts_counted integer,
  choice_open boolean
)
language sql
stable
-- Reads `plans`, plan_of() and `applied_plans`, which users may not.
security definer
set search_path = ''
as $$
  select p.exercises, p.workouts, p.versions, 12, p.added_alternatives,
    public.added_alternative_count((select auth.uid())), p.archive,
    public.counted_workouts((select auth.uid())),
    coalesce(
      (select a.choice_open from public.applied_plans a where a.user_id = (select auth.uid())),
      false
    )
  from public.plan_limits((select auth.uid())) p;
$$;

revoke execute on function public.workout_limits from public, anon;
grant execute on function public.workout_limits to authenticated;

-- Makes the caller's one choice: `workouts` are the active ones that stay, as many as the plan has
-- room for or all there are, and `alternatives` likewise among theirs, as the plan's limits on them
-- allow. The rest wait; what is in the archive stays as it is. The plan changes, so the days before
-- the device's `today` are kept with the plan they had (ADR 0041).
create function public.choose_what_stays(workouts bigint[], alternatives bigint[], today date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  limits public.plans;
  kept bigint[] := coalesce(choose_what_stays.workouts, '{}');
  kept_alternatives bigint[] := coalesce(choose_what_stays.alternatives, '{}');
  active_count integer;
  allowed_alternatives integer;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform public.lock_user_limits(caller_id);
  limits := public.plan_limits(caller_id);
  if not coalesce(
    (select a.choice_open from public.applied_plans a where a.user_id = caller_id),
    false
  ) then
    raise exception 'There is no choice to make' using errcode = 'BB055';
  end if;
  -- The rows before the plan's lock, as set_workout_active() takes them.
  perform 1 from public.workouts w where w.user_id = caller_id order by w.id for update;

  select count(*)::integer into active_count from public.workouts w
  where w.user_id = caller_id and w.active;
  if cardinality(kept) <> least(active_count, limits.workouts)
    or (select count(distinct k) from unnest(kept) k) <> cardinality(kept)
    or exists (
      select 1 from unnest(kept) k
      where not exists (
        select 1 from public.workouts w
        where w.id = k and w.user_id = caller_id and w.active
      )
    ) then
    raise exception 'The workouts do not fit the plan' using errcode = 'BB056';
  end if;

  -- As many as the kept workouts could keep: each up to its versions, then up to the plan's total.
  select coalesce(sum(least(c.added, limits.versions - 1)), 0)::integer into allowed_alternatives
  from (
    select count(*) as added from public.workout_alternatives a
    where a.user_id = caller_id and a.workout_id = any (kept) and a.exercises is not null
    group by a.workout_id
  ) c;
  if cardinality(kept_alternatives)
      <> least(allowed_alternatives, coalesce(limits.added_alternatives, allowed_alternatives))
    or (select count(distinct k) from unnest(kept_alternatives) k) <> cardinality(kept_alternatives)
    or exists (
      select 1 from unnest(kept_alternatives) k
      where not exists (
        select 1 from public.workout_alternatives a
        where a.id = k and a.user_id = caller_id and a.workout_id = any (kept)
          and a.exercises is not null
      )
    )
    or exists (
      select 1 from public.workout_alternatives a
      where a.id = any (kept_alternatives)
      group by a.workout_id
      having count(*) >= limits.versions
    ) then
    raise exception 'The alternatives do not fit the plan' using errcode = 'BB056';
  end if;

  perform public.keep_planned_days(choose_what_stays.today);
  update public.workouts w set held = not (w.id = any (kept))
  where w.user_id = caller_id and w.active and w.held is distinct from not (w.id = any (kept));
  update public.workout_alternatives a set held = not (a.id = any (kept_alternatives))
  from public.workouts w
  where w.id = a.workout_id and w.user_id = caller_id and w.active and a.exercises is not null
    and a.held is distinct from not (a.id = any (kept_alternatives));
  update public.applied_plans a set choice_open = false where a.user_id = caller_id;
end;
$$;

revoke execute on function public.choose_what_stays(bigint[], bigint[], date) from public, anon;
grant execute on function public.choose_what_stays(bigint[], bigint[], date) to authenticated;
revoke execute on function public.has_waiting_choices(uuid) from public, anon, authenticated;

-- Those who wait for premium now have not had the choice: it is theirs too.
update public.applied_plans a set choice_open = true where public.has_waiting_choices(a.user_id);
