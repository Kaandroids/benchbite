-- The backend refuses a build of the app that is no longer supported (#687, ADR 0157). The app
-- shows "Update Benchbite" in place of itself, but a build that has not asked yet, or one made to
-- skip the screen, would go on reading and writing. The app names its platform and version in two
-- headers of every request, and the Data API checks them before each one.
--
-- The check runs before every request, so a fault in it would stop the whole app. It therefore
-- refuses only what it is sure of: a signed-in client, both headers readable, and a version below
-- the lowest supported one. Anything else passes, as does any error within the check itself.

-- Whether a version of the app is still supported on its platform. An unknown platform and a
-- version that cannot be read count as supported, as in app_requirements().
create function public.app_version_supported(platform text, app_version text)
returns boolean
language sql
stable
-- Reads supported_app_versions, which is closed to clients.
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select public.version_number(app_version) >= public.version_number(s.lowest_version)
      from public.supported_app_versions s
      where s.platform::text = app_version_supported.platform
    ),
    true
  );
$$;

-- Runs before each request to the Data API, as the request's role. Raises BB064 for a build that
-- is no longer supported; the app then asks app_requirements() again and shows the update screen.
create function public.check_app_version()
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  headers json;
  supported boolean := true;
begin
  begin
    -- Only the app's signed-in requests carry a version to judge: the service role is the
    -- backend's own, and a client without a session reaches nothing that needs one.
    if current_user <> 'authenticated' then
      return;
    end if;
    -- The one question a refused build must still get an answer to.
    if ltrim(current_setting('request.path', true), '/') = 'rpc/app_requirements' then
      return;
    end if;
    headers := current_setting('request.headers', true)::json;
    supported := public.app_version_supported(
      headers ->> 'x-app-platform', headers ->> 'x-app-version'
    );
  exception when others then
    -- A fault here must not stop the app: the request passes.
    supported := true;
  end;

  if supported is false then
    raise exception 'This version of the app is no longer supported' using errcode = 'BB064';
  end if;
end;
$$;

-- New functions are closed to clients (ADR 0126). Every role a request runs as must be able to
-- run the check, or its requests fail; the check holds no rights of its own.
revoke all on function public.app_version_supported(text, text) from public, anon, authenticated;
grant execute on function public.app_version_supported(text, text) to authenticated;
revoke all on function public.check_app_version() from public;
grant execute on function public.check_app_version() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'public.check_app_version';
notify pgrst, 'reload config';
