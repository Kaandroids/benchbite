-- Bite's cards for an alternative or a switch (#397, ADR 0075) show what applying changes, as the
-- database read it for the proposal: the proposers give it with the proposal's id, so that the card
-- is built from nothing read after the proposal is made, in the database, beside the rules of
-- applying it follows.

-- The alternative in use in `state` (coach_alternatives_state()), whole; null without any.
create function public.in_use_alternative(state jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select a from jsonb_array_elements(state -> 'alternatives') a where (a ->> 'inUse')::boolean;
$$;

-- An alternative of `state` (coach_alternatives_state()) as a card names it: its name, or none,
-- and its place.
create function public.card_alternative(alternative jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('name', alternative -> 'name', 'position', alternative -> 'position');
$$;

-- As before (20261102140100_coach_alternative_proposals.sql), giving `{id, from}`: `from` is the
-- alternative the new one is made from, as applying leaves it, named `currentName` when the change
-- keeps one (apply_coach_change()), and without alternatives the workout's own, which
-- add_workout_alternative() makes the first.
drop function public.propose_coach_alternative(bigint, bigint, text, text, jsonb, date);
create function public.propose_coach_alternative(
  thread_id bigint,
  workout_id bigint,
  name text,
  current_name text,
  edit jsonb,
  today date
)
returns jsonb
language plpgsql
-- Reads the workout with workout_to_propose(), which callers may not.
security definer
set search_path = ''
as $$
declare
  workout jsonb := public.workout_to_propose(propose_coach_alternative.workout_id);
  proposed_id bigint;
  proposal public.coach_proposals;
  in_use jsonb;
begin
  proposed_id := public.propose_coach_change(
    propose_coach_alternative.thread_id,
    'alternative',
    jsonb_strip_nulls(jsonb_build_object(
      'workoutId', propose_coach_alternative.workout_id,
      'name', propose_coach_alternative.name,
      'currentName', propose_coach_alternative.current_name,
      'exercises', public.edited_workout_exercises(workout, edit)
    )),
    propose_coach_alternative.today
  );
  select * into proposal from public.coach_proposals p where p.id = proposed_id;
  -- Named as apply_coach_change() names it, and placed first without alternatives, as
  -- add_workout_alternative() places the workout's own: change them together.
  in_use := coalesce(public.in_use_alternative(proposal.before), '{"name": null, "position": 1}');
  return jsonb_build_object(
    'id', proposal.id,
    'from', public.card_alternative(
      in_use || jsonb_strip_nulls(jsonb_build_object('name', proposal.change -> 'currentName'))
    )
  );
end;
$$;

-- As before, giving `{id, from, to, back, empty}`: the alternative in use and the one put in use,
-- the exercises the latter has that the workout has not, in its order, and whether it has none,
-- which leaves the workout without exercises (ADR 0064).
drop function public.propose_coach_alternative_switch(bigint, bigint, date);
create function public.propose_coach_alternative_switch(
  thread_id bigint,
  alternative_id bigint,
  today date
)
returns jsonb
language plpgsql
-- Reads the caller's alternatives only, by user_id, as the table's policy would.
security definer
set search_path = ''
as $$
declare
  switched_workout_id bigint;
  proposed_id bigint;
  proposal public.coach_proposals;
  target jsonb;
begin
  select a.workout_id into switched_workout_id from public.workout_alternatives a
  where a.id = propose_coach_alternative_switch.alternative_id
    and a.user_id = (select auth.uid());
  if not found then
    raise exception 'Alternative not found' using errcode = 'P0002';
  end if;
  proposed_id := public.propose_coach_change(
    propose_coach_alternative_switch.thread_id,
    'alternative_switch',
    jsonb_build_object(
      'workoutId', switched_workout_id,
      'alternativeId', propose_coach_alternative_switch.alternative_id
    ),
    propose_coach_alternative_switch.today
  );
  select * into proposal from public.coach_proposals p where p.id = proposed_id;
  target := (
    select a from jsonb_array_elements(proposal.before -> 'alternatives') a
    where (a ->> 'id')::bigint = propose_coach_alternative_switch.alternative_id
  );
  return jsonb_build_object(
    'id', proposal.id,
    'from', public.card_alternative(public.in_use_alternative(proposal.before)),
    'to', public.card_alternative(target),
    'back', coalesce((
      select jsonb_agg(id order by n)
      from (
        select e ->> 'exerciseId' as id, min(n) as n
        from jsonb_array_elements(coalesce(target -> 'exercises', '[]')) with ordinality x(e, n)
        where not exists (
          select 1 from jsonb_array_elements(proposal.before -> 'workout' -> 'exercises') w
          where w ->> 'exerciseId' = e ->> 'exerciseId'
        )
        group by e ->> 'exerciseId'
      ) back
    ), '[]'),
    'empty', jsonb_array_length(coalesce(target -> 'exercises', '[]')) = 0
  );
end;
$$;

revoke all on function public.in_use_alternative(jsonb) from public, anon, authenticated;
revoke all on function public.card_alternative(jsonb) from public, anon, authenticated;
revoke all on function public.propose_coach_alternative(bigint, bigint, text, text, jsonb, date)
  from public, anon;
grant execute on function public.propose_coach_alternative(bigint, bigint, text, text, jsonb, date)
  to authenticated;
revoke all on function public.propose_coach_alternative_switch(bigint, bigint, date)
  from public, anon;
grant execute on function public.propose_coach_alternative_switch(bigint, bigint, date)
  to authenticated;
