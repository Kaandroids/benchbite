-- Lets the Monitor workflow check the photo purge with a token that can only read the database
-- (#536, ADR 0132). Such a token's queries run as supabase_read_only_user, which reads every table
-- but may call no function the migrations did not open to it. The status function runs as its
-- caller, so the role also needs the rule it asks; neither writes anything.
grant execute on function public.coach_media_purge_stalled() to supabase_read_only_user;
grant execute on function public.coach_media_purge_status() to supabase_read_only_user;
