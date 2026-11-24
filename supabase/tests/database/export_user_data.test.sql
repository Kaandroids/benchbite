-- Exporting a user's data (#553, ADR 0147): every table with a user's rows is exported or left
-- out on purpose, the export holds the user's own rows and none of another's, Bite's messages,
-- recipes and own exercises come with their children, and only the app's caller gets their own.
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com', false),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com', false),
  ('00000000-0000-0000-0000-00000000000c', null, true);

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;
grant execute on all functions in schema pg_temp to public;

select is(
  (select coalesce(array_agg(c.table_name::text order by 1), '{}')
    from information_schema.columns c
    join information_schema.tables t using (table_schema, table_name)
    where c.table_schema = 'public' and c.column_name in ('user_id', 'owner_id')
      and t.table_type = 'BASE TABLE'
      and c.table_name not in (select name from public.export_tables())
      and c.table_name not in (select public.export_nested())
      and c.table_name not in (select public.export_left_out())),
  '{}'::text[],
  'Every table with a user''s rows is exported or left out on purpose'
);

-- A and B each log a weight and a food of their own; A has a recipe, an exercise and a chat.
insert into public.weight_entries (user_id, weight_kg, measured_on) values
  ('00000000-0000-0000-0000-00000000000a', 70, current_date - 1),
  ('00000000-0000-0000-0000-00000000000a', 69.5, current_date),
  ('00000000-0000-0000-0000-00000000000b', 90, current_date);
insert into public.custom_foods (user_id, name, kcal, protein_g, carbs_g, fat_g) values
  ('00000000-0000-0000-0000-00000000000a', 'Ayran', 38, 1.7, 2.8, 2),
  ('00000000-0000-0000-0000-00000000000b', 'Secret', 100, 5, 10, 3);
insert into public.recipes (user_id, name, servings, serving_unit)
  values ('00000000-0000-0000-0000-00000000000a', 'Bowl', 2, 'serving');
insert into public.recipe_ingredients (recipe_id, position, custom_food_id, grams)
  select r.id, 0, f.id, 200 from public.recipes r, public.custom_foods f
  where r.user_id = '00000000-0000-0000-0000-00000000000a'
    and f.user_id = '00000000-0000-0000-0000-00000000000a';
insert into public.ai_consents (user_id, consent_version)
  values ('00000000-0000-0000-0000-00000000000a', '2026-11-18');
insert into public.coach_threads (user_id) values ('00000000-0000-0000-0000-00000000000a');
insert into public.coach_messages (thread_id, role, content)
  select id, 'user', '[{"type": "text", "text": "Hi Bite"}]' from public.coach_threads
  where user_id = '00000000-0000-0000-0000-00000000000a';

-- A's photo and voice message, an exercise photo, and B's photo.
insert into storage.objects (bucket_id, name, metadata) values
  ('coach-media', '00000000-0000-0000-0000-00000000000a/1/photo.jpg', '{"size": 1200}'),
  ('coach-media', '00000000-0000-0000-0000-00000000000a/1/voice.m4a', '{"size": 3400}'),
  ('exercise-photos', '00000000-0000-0000-0000-00000000000a/hip-thrust.jpg', '{"size": 900}'),
  ('coach-media', '00000000-0000-0000-0000-00000000000b/2/photo.jpg', '{"size": 1500}'),
  -- A name that leaves A's folder for B's, which an older policy let a user write.
  ('exercise-photos', '00000000-0000-0000-0000-00000000000a/../00000000-0000-0000-0000-00000000000b/x.jpg', '{"size": 10}');

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
create temp table made as select public.create_exercise(jsonb_build_object(
  'name', 'Hip thrust machine', 'metrics', jsonb_build_array('weight', 'reps'),
  'primaryMuscles', jsonb_build_array('glutes'), 'secondaryMuscles', jsonb_build_array(),
  'equipment', 'machine', 'level', 'intermediate', 'instructions', jsonb_build_array('Drive up.')
)) as id;
create temp table export as select public.export_my_data() as d;
reset role;

select is(
  (select d->'account'->>'email' from export),
  'a@example.com',
  'The export names its account'
);
select is(
  (select jsonb_agg(w->'weight_kg' order by w->>'measured_on') from export,
    jsonb_array_elements(d->'data'->'weight_entries') w),
  '[70, 69.5]'::jsonb,
  'It holds the user''s own rows, in their order'
);
select ok(
  (select not (d::text like '%Secret%') and not (d::text like '%00000000-0000-0000-0000-00000000000b%')
    from export),
  'And nothing of another user'
);
select ok(
  (select not exists (select 1 from jsonb_array_elements(d->'data'->'custom_foods') f where f ? 'user_id')
    from export),
  'The rows leave out the user''s id, which the account gives'
);
select is(
  (select (d->'data'->'recipes'->0->'ingredients'->0->>'grams')::numeric from export),
  200::numeric,
  'A recipe comes with its ingredients'
);
select is(
  (select d->'data'->'coach_threads'->0->'messages'->0->'content'->0->>'text' from export),
  'Hi Bite',
  'A chat comes with its messages'
);
select ok(
  (select d->'data'->'coach_threads'->0->'messages'->0 ?& array['model', 'input_tokens']
      and d->'data' ? 'ai_usage'
    from export),
  'With which model answered and the record of the AI, about the user''s own use (ADR 0168)'
);
select is(
  (select d->'data'->'exercises'->0->>'name' from export),
  'Hip thrust machine',
  'And the user''s own exercises'
);
select is(
  (select array_agg(k order by k) from export, jsonb_object_keys(d->'data') k),
  (select array_agg(n order by n) from (
    select name n from public.export_tables() union select public.export_nested()
  ) s),
  'The export holds each exported and nested table, and no other'
);
select ok(
  (select d->'data' ? 'health_data_consents' from export),
  'It holds what the user cannot read themselves, as their consents'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000c');
select is(
  (select public.export_my_data()->'account'->>'guest'),
  'true',
  'A guest exports their own'
);

select throws_ok(
  $$ select public.export_user_data('00000000-0000-0000-0000-00000000000b') $$,
  '42501',
  null,
  'A user cannot export another user''s data'
);

reset role;
set local role anon;
select throws_ok(
  $$ select public.export_my_data() $$,
  '42501',
  null,
  'Nor can anyone without an account or guest'
);

reset role;
select is(
  (select jsonb_agg(jsonb_build_array(m->>'bucket', m->>'path', (m->>'bytes')::int)) from export,
    jsonb_array_elements(d->'media') m),
  '[["coach-media", "00000000-0000-0000-0000-00000000000a/1/photo.jpg", 1200],
    ["coach-media", "00000000-0000-0000-0000-00000000000a/1/voice.m4a", 3400],
    ["exercise-photos", "00000000-0000-0000-0000-00000000000a/hip-thrust.jpg", 900]]'::jsonb,
  'It lists the user''s own photos and voice messages, for the ZIP, and no other user''s'
);
select is_empty(
  $$ select id from storage.buckets where not public
     except select public.export_buckets()
     except select public.export_left_out_buckets() $$,
  'Every private bucket of users'' files is in the export or left out on purpose'
);

select * from finish();
rollback;
