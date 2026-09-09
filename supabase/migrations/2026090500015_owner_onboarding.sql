create or replace function public.onboard_owner(
  p_currency text,
  p_timezone text,
  p_country text,
  p_legal_form text,
  p_opening_balance_cents bigint,
  p_safety_threshold_cents bigint
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  authenticated_user_id uuid := (select auth.uid());
begin
  if authenticated_user_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  if p_currency <> 'EUR'
    or p_country <> 'FR'
    or p_timezone is null
    or length(p_timezone) = 0
    or (p_legal_form is not null and length(p_legal_form) > 80)
    or p_safety_threshold_cents < 0
  then
    raise exception using errcode = '22023', message = 'INVALID_ONBOARDING_INPUT';
  end if;

  begin
    insert into public.app_settings (
      owner_user_id,
      currency,
      timezone,
      country,
      legal_form,
      manual_current_balance_cents,
      manual_balance_as_of,
      safety_cash_threshold_cents
    )
    values (
      authenticated_user_id,
      p_currency,
      p_timezone,
      p_country,
      p_legal_form,
      p_opening_balance_cents,
      (current_timestamp at time zone p_timezone)::date,
      p_safety_threshold_cents
    );
  exception
    when unique_violation then
      raise exception using errcode = '23505', message = 'OWNER_ALREADY_EXISTS';
  end;

  insert into public.cashflow_categories (owner_user_id, name, type, system_category)
  values
    (authenticated_user_id, 'Clients', 'inflow', true),
    (authenticated_user_id, 'Logiciels', 'outflow', true),
    (authenticated_user_id, 'Rémunération', 'outflow', true),
    (authenticated_user_id, 'Fiscal et social', 'outflow', true);
end;
$$;

revoke all on function public.onboard_owner(text, text, text, text, bigint, bigint)
from public, anon;

grant execute on function public.onboard_owner(text, text, text, text, bigint, bigint)
to authenticated;
