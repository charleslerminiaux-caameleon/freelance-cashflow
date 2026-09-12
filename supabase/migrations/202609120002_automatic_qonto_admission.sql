-- Automatic admission shares the publication lock; manual acquisition is unchanged.
alter table public.integrations add column last_auto_attempt_at timestamptz
  check (last_auto_attempt_at is null or isfinite(last_auto_attempt_at));

create function public.acquire_automatic_banking_sync(p_owner_user_id uuid, p_run_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.integrations; v_now timestamptz; v_result jsonb;
begin
  perform public.banking_require_owner(p_owner_user_id);
  select * into v from public.integrations
    where owner_user_id=p_owner_user_id and provider='qonto' for update;
  if not found then return null; end if;
  -- Read time and the latest row after waiting, including a preceding publication.
  v_now := clock_timestamp();
  if v.last_success_at is null or not isfinite(v.last_success_at)
    or v.last_success_at > v_now-interval '24 hours'
    or v.lease_expires_at > v_now
    or v.last_auto_attempt_at > v_now-interval '15 minutes' then
    return null;
  end if;
  v_result := public.acquire_banking_sync(p_owner_user_id,p_run_id);
  update public.integrations set last_auto_attempt_at=v_now where id=v.id;
  return v_result;
exception when sqlstate '42501' or raise_exception then raise;
  when others then raise exception using errcode='P0001',message='DATABASE_ERROR';
end;
$$;
revoke all on function public.acquire_automatic_banking_sync(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.acquire_automatic_banking_sync(uuid,uuid) to service_role;
