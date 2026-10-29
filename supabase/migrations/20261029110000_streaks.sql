-- The daily streak (ADR 0042, ADR 0044): a day counts when its planned workouts are done and some
-- calories, no more than its target, were eaten. A missed day breaks the streak until the user
-- answers it, freezing the missed days or starting again. Days are kept once they are final.

create type public.streak_result as enum ('counted', 'frozen', 'missed');

-- Final days and how they went. Days not kept yet are worked out when read.
create table public.streak_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  result public.streak_result not null,
  primary key (user_id, day)
);

-- Each user's freezes and the last day whose break they answered. A user without a row has the 3
-- freezes every user starts with and has answered nothing yet.
create table public.user_streaks (
  user_id uuid primary key references auth.users (id) on delete cascade,
  freezes integer not null default 3 check (freezes >= 0),
  answered_through date
);

alter table public.streak_days enable row level security;
alter table public.user_streaks enable row level security;

create policy "Users read their streak days"
  on public.streak_days for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users read their freezes"
  on public.user_streaks for select to authenticated
  using (user_id = (select auth.uid()));

-- Only the functions below write them.
revoke all on public.streak_days, public.user_streaks from anon, authenticated;
grant select on public.streak_days, public.user_streaks to authenticated;

-- The caller's first day: the day their plan started (ADR 0041), or the day the account was
-- created for users from before it was recorded.
create function public.streak_start()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select k.started_on from public.planned_days_kept k where k.user_id = (select auth.uid())),
    (select (u.created_at at time zone 'UTC')::date from auth.users u where u.id = (select auth.uid()))
  );
$$;

-- How each of the caller's days from `from_day` to `to_day` went, from their first day to the
-- device's today: kept days as kept, the others worked out. A day counts when every workout
-- planned on it, after moves, was started on it, none was skipped, and more than none but no
-- more than its target's calories were eaten. Today is open until it counts.
create function public.streak_states(from_day date, to_day date, today date)
returns table (day date, state text)
language sql
stable
security definer
set search_path = ''
as $$
  with bounds as (
    select
      greatest(streak_states.from_day, public.streak_start()) as first_day,
      least(streak_states.to_day, streak_states.today, streak_states.from_day + 366) as last_day
  ),
  days as (
    select d::date as day
    from bounds b, generate_series(b.first_day, b.last_day, interval '1 day') d
  ),
  planned as (
    select p.day, p.workout_id
    from bounds b, public.planned_workouts(b.first_day, b.last_day, streak_states.today) p
  ),
  moves as (
    select m.workout_id, m.from_on, m.to_on
    from public.workout_moves m, bounds b
    where m.user_id = (select auth.uid())
      and (m.from_on between b.first_day and b.last_day or m.to_on between b.first_day and b.last_day)
  ),
  -- The workouts each day needs: those planned on it that did not move away or were skipped, and
  -- those moved to it.
  needed as (
    select p.day, p.workout_id
    from planned p
    where not exists (
      select 1 from moves m where m.workout_id = p.workout_id and m.from_on = p.day
    )
    union
    select m.to_on, m.workout_id from moves m where m.to_on is not null
  ),
  skipped as (
    select distinct p.day
    from planned p
    join moves m on m.workout_id = p.workout_id and m.from_on = p.day and m.to_on is null
  ),
  eaten as (
    select e.day, sum(e.kcal) as kcal
    from public.meal_entries e, bounds b
    where e.user_id = (select auth.uid()) and e.day between b.first_day and b.last_day
    group by e.day
  ),
  worked_out as (
    select
      d.day,
      d.day not in (select s.day from skipped s)
        and not exists (
          select 1
          from needed n
          where n.day = d.day
            and not exists (
              select 1
              from public.workout_logs l
              where l.user_id = (select auth.uid())
                and l.workout_id = n.workout_id
                and l.started_on = n.day
            )
        )
        and coalesce(e.kcal, 0) > 0
        and e.kcal <= (public.targets_of_day(d.day, streak_states.today)).calories as counts
    from days d
    left join eaten e on e.day = d.day
  )
  select
    w.day,
    case
      when k.result is not null then k.result::text
      when w.counts then 'counted'
      when w.day >= streak_states.today then 'open'
      else 'missed'
    end
  from worked_out w
  left join public.streak_days k on k.user_id = (select auth.uid()) and k.day = w.day
  order by w.day;
$$;

-- Locks the caller's streak, so that keeping days and answering a break wait for each other, and
-- returns it, with the freezes every user starts with.
create function public.lock_user_streak()
returns public.user_streaks
language plpgsql
security definer
set search_path = ''
as $$
declare
  streak public.user_streaks;
begin
  insert into public.user_streaks (user_id) values ((select auth.uid())) on conflict do nothing;
  select * into streak from public.user_streaks s where s.user_id = (select auth.uid()) for update;
  return streak;
end;
$$;

-- Keeps the caller's days through `through` that are not kept yet, with how they went, a year
-- at a time, as a day is worked out from at most a year of plan.
create function public.keep_streak_days(through date, today date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_day date := coalesce(
    (select max(k.day) + 1 from public.streak_days k where k.user_id = (select auth.uid())),
    public.streak_start()
  );
begin
  while next_day <= keep_streak_days.through loop
    insert into public.streak_days (user_id, day, result)
    select (select auth.uid()), s.day, s.state::public.streak_result
    from public.streak_states(
      next_day, least(keep_streak_days.through, next_day + 365), keep_streak_days.today
    ) s
    where s.state <> 'open'
    on conflict do nothing;
    next_day := next_day + 366;
  end loop;
end;
$$;

-- The caller's streak on the device's today: the days in a row up to yesterday, and today once it
-- counts. A missed day not answered yet breaks it; then `missed` lists the days to answer and
-- `saved_count` is the streak if they were frozen. Days that can no longer be logged, more than a
-- week ago on the server, are kept first, so only the days since are worked out.
create function public.streak(today date)
returns table (
  count integer,
  counted_today boolean,
  freezes integer,
  missed date[],
  saved_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  mine public.user_streaks;
  first_open date;
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform public.assert_device_today(streak.today);
  mine := public.lock_user_streak();
  perform public.keep_streak_days(least(streak.today - 1, current_date - 9), streak.today);
  first_open := coalesce(
    (select max(k.day) + 1 from public.streak_days k where k.user_id = (select auth.uid())),
    public.streak_start()
  );

  return query
  with states as (
    select k.day, k.result::text as state
    from public.streak_days k
    where k.user_id = (select auth.uid()) and k.day < first_open
    union all
    select s.day, s.state
    from public.streak_states(first_open, streak.today, streak.today) s
  ),
  -- The last missed day before today, and the last one whose break was answered.
  breaks as (
    select
      max(s.day) filter (where s.state = 'missed') as last_missed,
      max(s.day) filter (
        where s.state = 'missed' and s.day <= coalesce(mine.answered_through, '-infinity')
      ) as last_answered
    from states s
    where s.day < streak.today
  ),
  today_state as (
    select coalesce(bool_or(s.state = 'counted'), false) as counted
    from states s
    where s.day = streak.today
  )
  select
    (
      select count(*)::integer from states s
      where s.day > coalesce(b.last_missed, '-infinity') and s.day < streak.today
    ) + t.counted::integer,
    t.counted,
    mine.freezes,
    coalesce(
      (
        select array_agg(s.day order by s.day) from states s
        where s.state = 'missed'
          and s.day > coalesce(mine.answered_through, '-infinity') and s.day < streak.today
      ),
      '{}'
    ),
    (
      select count(*)::integer from states s
      where s.day > coalesce(b.last_answered, '-infinity') and s.day < streak.today
    ) + t.counted::integer
  from breaks b, today_state t;
end;
$$;

-- Answers the break of the caller's streak: freezes each missed day not answered yet, one freeze
-- each, when the user has enough, or starts the streak again. Either way, the days through
-- yesterday are final from now on.
create function public.answer_streak_break(today date, use_freezes boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  mine public.user_streaks;
  missed date[];
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform public.assert_device_today(answer_streak_break.today);
  mine := public.lock_user_streak();
  perform public.keep_streak_days(answer_streak_break.today - 1, answer_streak_break.today);

  select coalesce(array_agg(k.day), '{}') into missed
  from public.streak_days k
  where k.user_id = (select auth.uid())
    and k.result = 'missed'
    and k.day > coalesce(mine.answered_through, '-infinity')
    and k.day < answer_streak_break.today;

  if use_freezes and cardinality(missed) > 0 then
    if mine.freezes < cardinality(missed) then
      raise exception 'Not enough freezes for the missed days' using errcode = 'BB032';
    end if;
    update public.streak_days k set result = 'frozen'
    where k.user_id = (select auth.uid()) and k.day = any (missed);
    update public.user_streaks s set freezes = s.freezes - cardinality(missed)
    where s.user_id = (select auth.uid());
  end if;

  update public.user_streaks s
  set answered_through = greatest(s.answered_through, answer_streak_break.today - 1)
  where s.user_id = (select auth.uid());
end;
$$;

revoke execute on function
  public.streak_start(),
  public.lock_user_streak(),
  public.keep_streak_days(date, date)
from public, anon, authenticated;

revoke execute on function
  public.streak_states(date, date, date),
  public.streak(date),
  public.answer_streak_break(date, boolean)
from public, anon;
grant execute on function
  public.streak_states(date, date, date),
  public.streak(date),
  public.answer_streak_break(date, boolean)
to authenticated;
