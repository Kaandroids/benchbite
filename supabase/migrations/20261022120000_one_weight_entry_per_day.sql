-- A weight is logged once a day: logging again on the same day corrects it rather than adding a
-- second entry, which would leave the day's weight ambiguous for charts and targets. The app
-- writes the day in the user's time zone, so the database's default date is only a fallback.

-- Keeps the latest entry of a day where there are several.
delete from public.weight_entries e
using public.weight_entries later
where later.user_id = e.user_id
  and later.measured_on = e.measured_on
  and later.id > e.id;

alter table public.weight_entries
  add constraint weight_entries_user_id_measured_on_key unique (user_id, measured_on);

-- The unique constraint's index covers the lookups of the old one.
drop index public.weight_entries_user_id_measured_on_idx;
