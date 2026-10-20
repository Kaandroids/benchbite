-- At most six training days a week, so that every plan keeps at least one day of rest.
alter table public.profiles drop constraint profiles_training_days_check;

alter table public.profiles add constraint profiles_training_days_check check (
  cardinality(training_days) between 1 and 6
  and training_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
);
