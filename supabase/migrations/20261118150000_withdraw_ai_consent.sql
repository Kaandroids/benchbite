-- Withdrawing the consent to the AI features (#656, ADR 0143). The consent is the only legal basis
-- for Bite's chats and notes, so withdrawing it deletes them (GDPR Art. 17(1)(b)) and records the
-- withdrawal; from then on ai_access() asks for the consent again.

-- When the user withdrew their consent. Like the consents, an entry is never changed, so the history
-- shows when each was given and withdrawn; it is deleted with the user.
create table public.ai_consent_withdrawals (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  withdrawn_at timestamptz not null default now()
);

create index ai_consent_withdrawals_user_id_idx on public.ai_consent_withdrawals (user_id);

-- Users read their own; only withdraw_ai_consent() writes them.
alter table public.ai_consent_withdrawals enable row level security;

create policy "Users read their own AI consent withdrawals"
  on public.ai_consent_withdrawals for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.ai_consent_withdrawals from anon, authenticated;
grant select on public.ai_consent_withdrawals to authenticated;

-- As before, and only a consent given after the last withdrawal counts.
create or replace function public.has_ai_consent(user_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.ai_consents c
    where c.user_id = has_ai_consent.user_id
      and c.granted_at > coalesce(
        (select max(w.withdrawn_at) from public.ai_consent_withdrawals w
          where w.user_id = has_ai_consent.user_id),
        '-infinity'
      )
  );
$$;

-- Withdraws the caller's consent and deletes what rests on it alone, in one transaction:
-- - Bite's chats, with their messages, meal cards and proposals; deleting the threads queues their
--   photos and voice messages for the purge of coach media (ADR 0063);
-- - Bite's notebook, and the stops of answers.
-- What has another basis stays: meals and workouts logged from Bite's cards are part of the logs
-- under the health data consent, ai_usage holds no health data and counts toward the plan's
-- budget, and the consents and withdrawals are the proof of both (Art. 7(1)).
create function public.withdraw_ai_consent()
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
  if not public.has_ai_consent(caller_id) then
    raise exception 'There is no AI consent to withdraw' using errcode = 'BB060';
  end if;

  insert into public.ai_consent_withdrawals (user_id) values (caller_id);
  delete from public.coach_threads t where t.user_id = caller_id;
  delete from public.coach_notes n where n.user_id = caller_id;
  delete from public.coach_stops s where s.user_id = caller_id;
end;
$$;

revoke execute on function public.withdraw_ai_consent() from public, anon;
grant execute on function public.withdraw_ai_consent() to authenticated;
