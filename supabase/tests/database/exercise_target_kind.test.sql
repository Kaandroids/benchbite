-- Which target an exercise takes, as target_suits() checks it (#402).
begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

select is(
  (select public.target_kind(e) from public.exercises e where e.id = 'Barbell_Squat'),
  'reps',
  'One counted in reps takes reps'
);
select is(
  (select public.target_kind(e) from public.exercises e where e.id = 'Plank'),
  'time',
  'A timed one takes seconds'
);
select is(
  (select public.target_kind(e) from public.exercises e where e.id = 'Rowing_Stationary'),
  'distance',
  'A distance takes meters or seconds'
);
select ok(
  (
    select bool_and(public.target_suits(
      e.metrics,
      case public.target_kind(e)
        when 'reps' then '{"reps": {"min": 8, "max": 12}}'::jsonb
        else '{"seconds": 30}'::jsonb
      end
    ))
    from public.exercises e
  ),
  'and every exercise takes the target it names'
);

select * from finish();
rollback;
