-- A copy of everything Benchbite keeps about a user, as one JSON document (#553, ADR 0147), for
-- GDPR Art. 15 and 20. The app asks for its own with export_my_data(); the website's link will ask
-- for its owner's through export_user_data(), so both give the same file.

-- The tables whose rows of a user are exported whole, but for the user's id, with what orders
-- them. Each table with a user_id is either here or in export_left_out(), which a test checks, so
-- that a table added later is not left out of the export unnoticed.
create function public.export_tables()
returns table (name text, order_by text)
language sql
immutable
set search_path = ''
as $$
  values
    ('profiles', 'user_id'),
    ('goals', 'user_id'),
    ('weight_entries', 'measured_on'),
    ('own_nutrition_targets', 'user_id'),
    ('day_nutrition_targets', 'day'),
    ('applied_plans', 'user_id'),
    ('workouts', 'id'),
    ('workout_exercises', 'id'),
    ('workout_alternatives', 'id'),
    ('workout_moves', 'id'),
    ('planned_days', 'day'),
    ('planned_days_kept', 'user_id'),
    ('workout_logs', 'id'),
    ('logged_sets', 'id'),
    ('outside_workouts', 'started_at'),
    ('meal_entries', 'id'),
    ('water_days', 'day'),
    ('step_days', 'day'),
    ('streak_days', 'day'),
    ('user_streaks', 'user_id'),
    ('custom_foods', 'id'),
    ('favourite_foods', 'id'),
    ('coach_notes', 'id'),
    ('coach_meal_cards', 'id'),
    ('coach_proposals', 'id'),
    ('health_data_consents', 'id'),
    ('health_data_consent_withdrawals', 'id'),
    ('ai_consents', 'id'),
    ('ai_consent_withdrawals', 'id'),
    ('terms_acceptances', 'id'),
    ('subscriptions', 'user_id'),
    ('ai_usage', 'id'),
    ('password_changes', 'changed_at');
$$;

-- The tables with a user_id that the export leaves out: proofs and limits of links and codes,
-- which hold only hashes and last minutes, and the work queues of the moment.
create function public.export_left_out()
returns setof text
language sql
immutable
set search_path = ''
as $$
  values
    ('account_deletion_codes'), ('account_deletion_links'), ('account_deletion_tries'),
    ('consent_withdrawal_links'), ('ai_calls_in_flight'), ('coach_media_deletions'),
    ('coach_stops'), ('removed_meal_entries'),
    -- Exported with their children below.
    ('coach_threads'), ('recipes');
$$;

-- The export of a user: the account, each table above, and what hangs off a row of the user's
-- without a user_id of its own: Bite's messages in their chats, a recipe's ingredients, and the
-- user's own exercises with their names. Photos and voice messages are named by their path in
-- the messages, not included (#553). Called only from the functions below, which run as their
-- owner.
create function public.export_user_data(user_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  -- Named apart from the tables' columns, so that queries cannot confuse the two.
  target_id uuid := export_user_data.user_id;
  data jsonb := '{}';
  rows jsonb;
  t record;
begin
  for t in select * from public.export_tables() loop
    -- The names are the function's own, never a caller's.
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(r) - ''user_id'' order by r.%I), ''[]'') '
        'from public.%I r where r.user_id = $1',
      t.order_by, t.name
    ) into rows using target_id;
    data := data || jsonb_build_object(t.name, rows);
  end loop;

  data := data || jsonb_build_object(
    'coach_threads', (
      select coalesce(jsonb_agg(to_jsonb(th) - 'user_id' || jsonb_build_object('messages', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'role', m.role, 'content', m.content, 'expression', m.expression,
          'interrupted', m.interrupted, 'created_at', m.created_at
        ) order by m.id), '[]')
        from public.coach_messages m where m.thread_id = th.id
      )) order by th.id), '[]')
      from public.coach_threads th where th.user_id = target_id
    ),
    'recipes', (
      select coalesce(jsonb_agg(to_jsonb(re) - 'user_id' || jsonb_build_object('ingredients', (
        select coalesce(jsonb_agg(to_jsonb(i) - 'recipe_id' order by i.position), '[]')
        from public.recipe_ingredients i where i.recipe_id = re.id
      )) order by re.id), '[]')
      from public.recipes re where re.user_id = target_id
    ),
    'exercises', (
      select coalesce(jsonb_agg(to_jsonb(x) - 'owner_id' || jsonb_build_object('names', (
        select coalesce(jsonb_object_agg(n.language, n.name), '{}')
        from public.exercise_translations n where n.exercise_id = x.id
      )) order by x.id), '[]')
      from public.exercises x where x.owner_id = target_id
    )
  );

  return jsonb_build_object(
    'format', 'benchbite-export',
    'version', 1,
    'exported_at', now(),
    'account', (
      select jsonb_build_object(
        'id', u.id, 'email', u.email, 'created_at', u.created_at, 'guest', u.is_anonymous
      )
      from auth.users u where u.id = target_id
    ),
    'data', data
  );
end;
$$;

revoke execute on function public.export_tables(), public.export_left_out(),
  public.export_user_data(uuid) from public, anon, authenticated;

-- The caller's own export, for the app: guests too, as their data is on the server as well.
create function public.export_my_data()
returns jsonb
language plpgsql
stable
-- Reads tables and columns the user may not read themselves, such as their consents and usage.
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  return public.export_user_data(caller_id);
end;
$$;

revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
