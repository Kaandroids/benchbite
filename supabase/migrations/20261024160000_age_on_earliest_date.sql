-- Ages are counted on the date where the new year begins first (UTC+14), not on the server's UTC
-- date (codebase review). On New Year's night in Europe the app already counts the new year while
-- the server did not, so a user who just turned 18 by the year was refused with BB002 on every
-- try. The onboarding only asks for the birth year, so the check is a year coarse anyway; a few
-- hours earlier changes nothing.
create or replace function public.age_in_years(birth_year integer)
returns integer
language sql
stable
set search_path = ''
as $$
  select extract(year from now() at time zone 'Etc/GMT-14')::integer - birth_year;
$$;
