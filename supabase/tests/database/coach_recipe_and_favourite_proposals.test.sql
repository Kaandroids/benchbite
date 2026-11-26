-- Bite's proposals to save a recipe and to change the favourites (ADR 0172): made only of foods
-- the user can log, applied through the app's own functions, and undone to what was there.
begin;
create extension if not exists pgtap with schema extensions;

select plan(29);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');
-- They have consented to the AI features, which a chat needs (ADR 0143).
insert into public.ai_consents (user_id, consent_version)
select id, (select version from public.current_agreement('ai_consent')) from auth.users
where id not in (select user_id from public.ai_consents);

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;
grant execute on all functions in schema pg_temp to public;

create temporary table ids (name text primary key, id bigint) on commit drop;
grant select, insert on ids to authenticated;

insert into public.coach_threads (user_id) values ('00000000-0000-0000-0000-00000000000a');
insert into ids select 'thread', max(id) from public.coach_threads;
insert into public.custom_foods (user_id, name, kcal, protein_g, carbs_g, fat_g) values
  ('00000000-0000-0000-0000-00000000000a', 'Stock', 10, 1, 1, 0);
insert into ids select 'stock', max(id) from public.custom_foods;
insert into public.custom_foods (user_id, name, kcal, protein_g, carbs_g, fat_g) values
  ('00000000-0000-0000-0000-00000000000b', 'Their stock', 10, 1, 1, 0);
insert into ids select 'b stock', max(id) from public.custom_foods;
insert into public.favourite_foods (user_id, food_id) values
  ('00000000-0000-0000-0000-00000000000a', 'B101000');

create function pg_temp.id(key text) returns bigint language sql as $$
  select id from ids where name = key;
$$;
create function pg_temp.propose(kind public.coach_proposal_kind, change jsonb) returns bigint
language sql as $$
  select public.propose_coach_change(pg_temp.id('thread'), kind, change, current_date);
$$;
create function pg_temp.decide(proposal bigint, decision public.coach_proposal_decision)
returns public.coach_proposal_status language sql as $$
  select public.decide_coach_proposal(proposal, decision, current_date);
$$;
create function pg_temp.soup(stock bigint) returns jsonb language sql as $$
  select jsonb_build_object(
    'name', ' Porridge ', 'servings', 2, 'servingUnit', 'bowl',
    'ingredients', jsonb_build_array(
      jsonb_build_object('foodId', 'C133000', 'grams', 100, 'portionUnit', 'serving',
        'portionCount', 2),
      jsonb_build_object('customFoodId', stock, 'grams', 300)
    )
  );
$$;
create function pg_temp.favourites() returns text[] language sql as $$
  select array_agg(coalesce(food_id, 'own ' || custom_food_id, 'recipe ' || recipe_id)
    order by food_id, custom_food_id, recipe_id)
  from public.favourite_foods where user_id = '00000000-0000-0000-0000-00000000000a';
$$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

-- A recipe: proposing saves nothing, and keeps the recipe as it would be saved.
insert into ids select 'recipe', pg_temp.propose('recipe', pg_temp.soup(pg_temp.id('stock')));
select is((select count(*)::int from public.recipes), 0, 'proposing a recipe saves none');
select is(
  (select change ->> 'name' from public.coach_proposals where id = pg_temp.id('recipe')),
  'Porridge',
  'its name is trimmed'
);
select is(
  (select before from public.coach_proposals where id = pg_temp.id('recipe')),
  null,
  'it replaces no recipe'
);

-- Only of foods the user can log, and checked as the app saves recipes.
select throws_ok(
  format($$select pg_temp.propose('recipe', pg_temp.soup(%s))$$, pg_temp.id('b stock')),
  'BB070', null, 'not with a food of someone else''s'
);
select throws_ok(
  $$select pg_temp.propose('recipe', pg_temp.soup(null) || '{"ingredients": [{"foodId": "X999999", "grams": 10}]}')$$,
  'BB070', null, 'not with a food the library does not have'
);
select throws_ok(
  $$select pg_temp.propose('recipe', pg_temp.soup(null) || '{"ingredients": [{"foodId": "C133000", "customFoodId": 1, "grams": 10}]}')$$,
  '22023', null, 'an ingredient is one food'
);
select throws_ok(
  $$select pg_temp.propose('recipe', pg_temp.soup(null) || '{"servingUnit": "bucket"}')$$,
  '22023', null, 'a serving has a unit the app knows'
);
select throws_ok(
  format($$select pg_temp.propose('recipe', pg_temp.soup(%s) || '{"servings": 51}')$$, pg_temp.id('stock')),
  '23514', null, 'the recipes'' own checks refuse too many servings'
);
select throws_ok(
  $$select pg_temp.propose('recipe', pg_temp.soup(null) || '{"servings": 1, "ingredients": [{"foodId": "C133000", "grams": 3000}, {"foodId": "B101000", "grams": 3000}]}')$$,
  '22023', 'A serving weighs at most 5,000 g', 'and a serving too heavy'
);

-- Applied through save_recipe(), and undone by deleting it.
select is(pg_temp.decide(pg_temp.id('recipe'), 'apply'), 'applied', 'the user saves the recipe');
select results_eq(
  $$ select r.name, r.servings, r.serving_unit::text, v.serving_grams
     from public.recipes r join public.recipe_values v on v.recipe_id = r.id $$,
  $$ values ('Porridge', 2::smallint, 'bowl', 200.0) $$,
  'saving it makes the recipe'
);
select results_eq(
  $$ select position, food_id, grams, portion_count from public.recipe_ingredients
     order by position $$,
  $$ values (0::smallint, 'C133000', 100.0, 2.0), (1::smallint, null, 300.0, null) $$,
  'with its ingredients in order'
);
select throws_ok(
  format($$select pg_temp.propose('recipe', pg_temp.soup(%s) || '{"name": "porridge"}')$$, pg_temp.id('stock')),
  'BB068', null, 'no second recipe of that name'
);
select is(pg_temp.decide(pg_temp.id('recipe'), 'undo'), 'undone', 'the user undoes it');
select is(
  (select count(*)::int from public.recipes where archived_at is null), 0,
  'undoing deletes the recipe'
);

-- A recipe the user changed since is not deleted.
insert into ids select 'again', pg_temp.propose('recipe', pg_temp.soup(pg_temp.id('stock')));
select is(pg_temp.decide(pg_temp.id('again'), 'apply'), 'applied', 'saved again');
update public.recipes set servings = 3 where archived_at is null;
select throws_ok(
  format($$select pg_temp.decide(%s, 'undo')$$, pg_temp.id('again')),
  'BB035', null, 'not undone once the user changed it'
);
insert into ids select 'porridge', id from public.recipes where archived_at is null;

-- The favourites: one already starred is removed, two are added, of them a recipe.
insert into ids select 'favourites', pg_temp.propose(
  'favourites',
  jsonb_build_object(
    'add', jsonb_build_array(
      jsonb_build_object('foodId', 'C133000'),
      jsonb_build_object('recipeId', pg_temp.id('porridge'))
    ),
    'remove', jsonb_build_array(jsonb_build_object('foodId', 'B101000'))
  )
);
select is(pg_temp.favourites(), array['B101000'], 'proposing changes no favourite');
select is(
  (select before from public.coach_proposals where id = pg_temp.id('favourites')),
  '{"starred": [{"foodId": "B101000"}]}',
  'the proposal keeps which of them are favourites'
);
select throws_ok(
  $$select pg_temp.propose('favourites', '{"add": [{"foodId": "B101000"}]}')$$,
  'BB069', null, 'not to add a favourite already'
);
select throws_ok(
  $$select pg_temp.propose('favourites', '{"remove": [{"foodId": "C133000"}]}')$$,
  'BB069', null, 'nor to remove one that is none'
);
select throws_ok(
  format($$select pg_temp.propose('favourites', '{"add": [{"customFoodId": %s}]}')$$, pg_temp.id('b stock')),
  'BB070', null, 'nor to add someone else''s food'
);
select throws_ok(
  $$select pg_temp.propose('favourites', '{"add": [{"foodId": "C133000"}, {"foodId": "C133000"}]}')$$,
  '22023', null, 'each food once'
);
select throws_ok(
  $$select pg_temp.propose('favourites', '{"add": []}')$$,
  '22023', null, 'and at least one'
);

select is(pg_temp.decide(pg_temp.id('favourites'), 'apply'), 'applied', 'the user applies it');
select is(
  pg_temp.favourites(), array['C133000', 'recipe ' || pg_temp.id('porridge')],
  'applying stars and unstars the foods'
);
select is(pg_temp.decide(pg_temp.id('favourites'), 'undo'), 'undone', 'the user undoes it');
select is(pg_temp.favourites(), array['B101000'], 'undoing puts the favourites back');

-- Someone else cannot decide them.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select throws_ok(
  format($$select pg_temp.decide(%s, 'keep')$$, pg_temp.id('again')),
  'P0002', null, 'no one else decides a proposal'
);

select * from finish();
rollback;
