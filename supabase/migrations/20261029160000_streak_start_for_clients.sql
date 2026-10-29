-- The app pages the week strip back to the caller's first week (ADR 0043), the day streak_start()
-- gives: the day their plan started, or the day the account was created. It reads only the
-- caller's own.
grant execute on function public.streak_start() to authenticated;
