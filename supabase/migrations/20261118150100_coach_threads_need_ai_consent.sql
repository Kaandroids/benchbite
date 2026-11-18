-- A chat is started only with the consent to the AI features (#656, ADR 0143). The chat function
-- checks access before it starts one, but a withdrawal between that check and the new thread would
-- leave a thread it never deletes, which the answer is then saved into. So the thread itself is
-- refused without a current consent (BB061), and a withdrawal and a new thread of the same user
-- wait for each other: the withdrawal deletes a thread started first, and one started after it is
-- refused.

-- Holds the user's AI consent still until the transaction ends.
create function public.lock_ai_consent(user_id uuid)
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('ai_consent:' || user_id::text, 0));
$$;

revoke execute on function public.lock_ai_consent(uuid) from public, anon, authenticated;

-- Volatile, so that the consent is read after the lock, with what a withdrawal has committed.
create function public.refuse_coach_thread_without_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.lock_ai_consent(new.user_id);
  if not public.has_ai_consent(new.user_id) then
    raise exception 'The user has not consented to the AI features' using errcode = 'BB061';
  end if;
  return new;
end;
$$;

revoke execute on function public.refuse_coach_thread_without_consent()
  from public, anon, authenticated;

create trigger coach_threads_need_ai_consent
  before insert on public.coach_threads
  for each row execute function public.refuse_coach_thread_without_consent();

-- As before, and holds the consent while it withdraws it.
create or replace function public.withdraw_ai_consent()
returns void
language plpgsql
-- Writes the withdrawals and stops, which callers may not.
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  -- After a chat being started now, which this then deletes, or before it, which is then refused.
  perform public.lock_ai_consent(caller_id);
  if not public.has_ai_consent(caller_id) then
    raise exception 'There is no AI consent to withdraw' using errcode = 'BB060';
  end if;

  insert into public.ai_consent_withdrawals (user_id) values (caller_id);
  delete from public.coach_threads t where t.user_id = caller_id;
  delete from public.coach_notes n where n.user_id = caller_id;
  delete from public.coach_stops s where s.user_id = caller_id;
end;
$$;
