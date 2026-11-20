-- Accepting the terms of use again when they change (#689, ADR 0158). The onboarding records the
-- first acceptance (ADR 0141); once the server names a newer version (ADR 0156), the app asks the
-- user again and records the answer here, in the same history.

-- Records that the caller accepts the current terms. Only the current version can be accepted:
-- an app that still shows an older one is refused (BB065) and asks what the current one is.
create function public.accept_terms(terms_version text)
returns void
language plpgsql
-- Writes terms_acceptances, which clients only read.
security definer
set search_path = ''
as $$
declare
  -- Named apart from the tables' columns, so that queries cannot confuse the two.
  caller_id uuid := (select auth.uid());
  current_version text;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select a.version into current_version
  from public.agreement_versions a
  where a.agreement = 'terms'
  order by a.applies_at desc, a.version desc
  limit 1;

  if terms_version is distinct from current_version then
    raise exception 'These are not the current terms of use' using errcode = 'BB065';
  end if;

  -- Accepting twice, as with a second tap or on a second phone, adds nothing.
  if terms_version is distinct from (
    select t.terms_version
    from public.terms_acceptances t
    where t.user_id = caller_id
    order by t.accepted_at desc, t.id desc
    limit 1
  ) then
    insert into public.terms_acceptances (user_id, terms_version)
    values (caller_id, accept_terms.terms_version);
  end if;
end;
$$;

-- New functions are closed to clients (ADR 0126); a guest has a session too.
revoke all on function public.accept_terms(text) from public, anon, authenticated;
grant execute on function public.accept_terms(text) to authenticated;
