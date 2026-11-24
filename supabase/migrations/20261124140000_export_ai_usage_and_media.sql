-- The export holds what an access request covers too (#712, ADR 0168): the record of the AI,
-- which ADR 0147 left out as the service's own, and the user's photos and voice messages, listed
-- here and put beside the file in the ZIP the Edge Functions build.

-- As before, and ai_usage is exported whole: which feature, model, tokens and cost each call had,
-- about the user's own use.
create or replace function public.export_tables()
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
    ('ai_usage', 'created_at'),
    ('health_app_consents', 'id'),
    ('health_app_consent_withdrawals', 'id'),
    ('terms_acceptances', 'id'),
    ('subscriptions', 'user_id'),
    ('password_changes', 'changed_at');
$$;

-- The private buckets of the user's own files that the export's ZIP holds, so that a test can tell
-- a new one apart: exercise-images is public and holds the library's pictures, no user's files.
create function public.export_buckets()
returns setof text
language sql
immutable
set search_path = ''
as $$
  values ('coach-media'), ('exercise-photos');
$$;

revoke execute on function public.export_buckets() from public, anon, authenticated;

-- As before, without ai_usage.
create or replace function public.export_left_out()
returns setof text
language sql
immutable
set search_path = ''
as $$
  values
    ('account_deletion_codes'), ('account_deletion_links'), ('account_deletion_tries'),
    ('consent_withdrawal_links'), ('data_export_links'), ('ai_calls_in_flight'),
    ('coach_media_deletions'), ('coach_stops'), ('removed_meal_entries');
$$;

-- As before (version 2): Bite's messages keep the model that answered and its tokens, and the
-- export lists the user's photos and voice messages in the private buckets, by bucket and path,
-- with their size, for the ZIP to fetch.
create or replace function public.export_user_data(user_id uuid)
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
        select coalesce(jsonb_agg(to_jsonb(m) - 'thread_id' order by m.id), '[]')
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
    'version', 2,
    'exported_at', now(),
    'account', (
      select jsonb_build_object(
        'id', u.id, 'email', u.email, 'created_at', u.created_at, 'guest', u.is_anonymous
      )
      from auth.users u where u.id = target_id
    ),
    'data', data,
    -- The user's photos and voice messages, which the export's ZIP holds beside this file.
    'media', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'bucket', o.bucket_id,
        'path', o.name,
        'bytes', (o.metadata ->> 'size')::bigint,
        'created_at', o.created_at
      ) order by o.bucket_id, o.name), '[]')
      from storage.objects o
      where o.bucket_id in (select public.export_buckets())
        and o.name like target_id::text || '/%'
        -- Only names in the user's own folders, as the app writes them: one with a . or .. part
        -- could name another user's file once read by its path.
        and o.name !~ '(^|/)\.\.?(/|$)'
    )
  );
end;
$$;
