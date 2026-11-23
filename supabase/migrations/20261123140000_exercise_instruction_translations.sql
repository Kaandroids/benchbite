-- The steps of the library's exercises in German and Turkish (#76, ADR 0164). English stays in
-- exercises.instructions, as names do in exercises.name, and an exercise without a row here is
-- shown in English. A user's own exercise has the steps its user wrote, in one language.
create table public.exercise_instruction_translations (
  exercise_id text not null references public.exercises (id) on delete cascade,
  -- English is the source in exercises and is not repeated here.
  language text not null check (language in ('de', 'tr')),
  -- As many steps as the exercise has in English, in the same order.
  instructions text[] not null,
  primary key (exercise_id, language)
);

-- Read by everyone using the app, anonymous users included, and changed by nobody, as the rest
-- of the library: no policy for writing, and the privileges revoked as well.
alter table public.exercise_instruction_translations enable row level security;

create policy "Exercise instruction translations are readable by everyone"
  on public.exercise_instruction_translations for select
  to anon, authenticated
  using (true);

grant select on public.exercise_instruction_translations to anon, authenticated;
revoke insert, update, delete, truncate
  on public.exercise_instruction_translations from anon, authenticated;
