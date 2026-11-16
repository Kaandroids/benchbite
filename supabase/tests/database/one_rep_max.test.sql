-- The one-rep max rounds a value ending in a 5 up, as the app does (#628).
begin;
create extension if not exists pgtap with schema extensions;

select plan(3);

select is(public.one_rep_max(37.5, 7), 46.3, '37.5 kg × 7 is 46.25, rounded up');
select is(public.one_rep_max(93.75, 4), 106.3, '93.75 kg × 4 is 106.25, rounded up');
select is(public.one_rep_max(100, 1), 100::numeric, 'A single rep is its own one-rep max');

select * from finish();
rollback;
