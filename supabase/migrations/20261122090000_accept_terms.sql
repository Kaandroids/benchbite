-- Accepting the terms of use again when they change (#689, ADR 0158). The onboarding records the
-- first acceptance (ADR 0141); once the server names a newer version (ADR 0156), the app asks the
-- user again and records the answer here, in the same history.

-- The current version of a text: its latest, also before the day it applies (ADR 0156). What the
-- app is told and what the server takes go by this one rule.
create function public.current_agreement(agreement public.agreement)
returns setof public.agreement_versions
language sql
stable
set search_path = ''
as $$
  select a.*
  from public.agreement_versions a
  where a.agreement = current_agreement.agreement
  order by a.applies_at desc, a.version desc
  limit 1;
$$;

-- app_requirements() as before (ADR 0157), with each text's current version from that rule.
create or replace function public.app_requirements(platform public.app_platform, app_version text)
returns jsonb
language sql
stable
-- Reads the two tables, which are closed to clients.
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'supported', public.app_version_supported(s.platform::text, app_version),
    'lowestVersion', s.lowest_version,
    'agreements', (
      select jsonb_object_agg(
        latest.agreement,
        jsonb_build_object(
          'version', latest.version,
          'appliesAt', latest.applies_at,
          'summary', latest.summary
        )
      )
      from unnest(enum_range(null::public.agreement)) as kind
      cross join lateral public.current_agreement(kind) latest
    )
  )
  from public.supported_app_versions s
  where s.platform = app_requirements.platform;
$$;

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

  select c.version into current_version from public.current_agreement('terms') c;

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
revoke all on function public.current_agreement(public.agreement) from public, anon, authenticated;
revoke all on function public.accept_terms(text) from public, anon, authenticated;
grant execute on function public.accept_terms(text) to authenticated;
