-- What a build of the app has to hold to (#688, ADR 0156): the lowest version of the app that is
-- still supported, and the current version of each text a user agrees to. The app ships without
-- updates over the air, so these live here, where they change without a release: an update to a
-- row is all it takes. The app reads them with app_requirements() when it opens.

create type public.app_platform as enum ('ios', 'android');

-- A version such as "1.4" or "1.4.2" as three numbers, which compare in order; null for anything
-- else.
create function public.version_number(version text)
returns integer[]
language sql
immutable
set search_path = ''
as $$
  select case
    when version ~ '^[0-9]{1,5}(\.[0-9]{1,5}){0,2}$' then (
      select array[
        coalesce(parts[1], 0), coalesce(parts[2], 0), coalesce(parts[3], 0)
      ]
      from (select string_to_array(version, '.')::integer[] as parts) split
    )
  end;
$$;

-- The lowest supported version of the app on each platform. A build below it is told to update
-- (#687). "0.0.0" supports every build.
create table public.supported_app_versions (
  platform public.app_platform primary key,
  lowest_version text not null check (public.version_number(lowest_version) is not null),
  updated_at timestamptz not null default now()
);

insert into public.supported_app_versions (platform, lowest_version)
values ('ios', '0.0.0'), ('android', '0.0.0');

create trigger set_supported_app_versions_updated_at
  before update on public.supported_app_versions
  for each row execute function extensions.moddatetime(updated_at);

-- The texts a user agrees to: the terms of use (ADR 0141), the consent to process health data,
-- recorded with the privacy policy's version (#44), and the consent to the AI features (ADR 0142).
create type public.agreement as enum ('terms', 'health_consent', 'ai_consent');

-- Each version of a text, from the day it applies. A new version is a new row, announced ahead by
-- a day in the future, so that users can be asked before it applies (#689); the latest row of a
-- text is its current version. `summary` says what changed, by language ("en", "de", "tr").
create table public.agreement_versions (
  agreement public.agreement not null,
  version text not null check (length(version) between 1 and 32),
  applies_at timestamptz not null,
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object'),
  primary key (agreement, version)
);

-- The versions the app's builds carried until now.
insert into public.agreement_versions (agreement, version, applies_at)
values
  ('terms', '2026-11-18', '2026-11-18'),
  ('health_consent', '2026-10-21', '2026-10-21'),
  ('ai_consent', '2026-11-18', '2026-11-18');

-- Read only through app_requirements(), changed only by the maintainer.
alter table public.supported_app_versions enable row level security;
alter table public.agreement_versions enable row level security;
revoke all on public.supported_app_versions, public.agreement_versions from anon, authenticated;

-- What a build has to hold to: whether its version is still supported on its platform, the lowest
-- that is, and the current version of each text with the day it applies and what changed. A
-- version that cannot be read counts as supported: the check must not lock anyone out by mistake.
create function public.app_requirements(platform public.app_platform, app_version text)
returns jsonb
language sql
stable
-- Reads the two tables, which are closed to clients.
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'supported',
    coalesce(
      public.version_number(app_version) >= public.version_number(s.lowest_version), true
    ),
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
      from (
        select distinct on (a.agreement) a.agreement, a.version, a.applies_at, a.summary
        from public.agreement_versions a
        order by a.agreement, a.applies_at desc, a.version desc
      ) latest
    )
  )
  from public.supported_app_versions s
  where s.platform = app_requirements.platform;
$$;

-- New functions are closed to clients (ADR 0126). The app asks once it has a session, which a
-- guest has too; a function with its owner's rights is never open to a client without one.
revoke all on function public.version_number(text) from public, anon, authenticated;
revoke all on function public.app_requirements(public.app_platform, text)
  from public, anon, authenticated;
grant execute on function public.app_requirements(public.app_platform, text) to authenticated;
