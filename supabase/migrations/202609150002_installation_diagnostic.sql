-- Read-only application compatibility contract, accessible only to the instance owner.
-- This is not a claim about the platform's full migration history or live Qonto access.
create function public.installation_diagnostic()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.app_settings where owner_user_id = auth.uid() and singleton_key
  ) then
    raise exception using errcode='42501',message='OWNER_REQUIRED';
  end if;
  return jsonb_build_object('version',1,'syncIntervalSeconds',300);
end;
$$;
revoke all on function public.installation_diagnostic() from public,anon,authenticated,service_role;
grant execute on function public.installation_diagnostic() to authenticated;
