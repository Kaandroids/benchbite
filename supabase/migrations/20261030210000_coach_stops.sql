-- Stopping Bite's answer on the server too (#327, ADR 0057). Closing the request does not always
-- reach the chat function through the gateway, so the app also says it stopped: it names the
-- request it sent, and the function looks for that between the steps of its answer.

create table public.coach_stops (
  request_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Written only through stop_coach_request(), read and removed only by the chat function with the
-- service role.
alter table public.coach_stops enable row level security;
revoke all on public.coach_stops from anon, authenticated;

-- Stops the caller's request `request_id`, which the chat function reads before it starts a
-- thread, before each request to the model, and while the answer comes. Stops of the caller's
-- older than an hour, whose answers ended long ago, go meanwhile.
create function public.stop_coach_request(request_id uuid)
returns void
language plpgsql
-- Writes the stops, which callers may not.
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  delete from public.coach_stops s
  where s.user_id = (select auth.uid()) and s.created_at < now() - interval '1 hour';
  insert into public.coach_stops (request_id, user_id)
  values (stop_coach_request.request_id, (select auth.uid()))
  on conflict do nothing;
end;
$$;

revoke all on function public.stop_coach_request(uuid) from public, anon;
grant execute on function public.stop_coach_request(uuid) to authenticated;
