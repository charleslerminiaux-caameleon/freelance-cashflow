alter function public.onboard_owner(text, text, text, text, bigint, bigint)
  security definer;

alter function public.onboard_owner(text, text, text, text, bigint, bigint)
  set search_path = '';

revoke all on function public.onboard_owner(text, text, text, text, bigint, bigint)
from public, anon, authenticated, service_role;

grant execute on function public.onboard_owner(text, text, text, text, bigint, bigint)
to authenticated;

revoke insert on table public.app_settings from public, anon, authenticated;

drop policy owner_access on public.customers;
create policy owner_access on public.customers
for all to authenticated
using (
  (select auth.uid()) = owner_user_id
  and exists (
    select 1
    from public.app_settings
    where app_settings.owner_user_id = (select auth.uid())
  )
)
with check (
  (select auth.uid()) = owner_user_id
  and exists (
    select 1
    from public.app_settings
    where app_settings.owner_user_id = (select auth.uid())
  )
);

drop policy owner_access on public.opportunities;
create policy owner_access on public.opportunities
for all to authenticated
using (
  (select auth.uid()) = owner_user_id
  and exists (
    select 1
    from public.app_settings
    where app_settings.owner_user_id = (select auth.uid())
  )
)
with check (
  (select auth.uid()) = owner_user_id
  and exists (
    select 1
    from public.app_settings
    where app_settings.owner_user_id = (select auth.uid())
  )
);

drop policy owner_access on public.engagements;
create policy owner_access on public.engagements
for all to authenticated
using (
  (select auth.uid()) = owner_user_id
  and exists (
    select 1
    from public.app_settings
    where app_settings.owner_user_id = (select auth.uid())
  )
)
with check (
  (select auth.uid()) = owner_user_id
  and exists (
    select 1
    from public.app_settings
    where app_settings.owner_user_id = (select auth.uid())
  )
);

drop policy owner_access on public.billing_schedule_items;
create policy owner_access on public.billing_schedule_items
for all to authenticated
using (
  (select auth.uid()) = owner_user_id
  and exists (
    select 1
    from public.app_settings
    where app_settings.owner_user_id = (select auth.uid())
  )
)
with check (
  (select auth.uid()) = owner_user_id
  and exists (
    select 1
    from public.app_settings
    where app_settings.owner_user_id = (select auth.uid())
  )
);

drop policy owner_access on public.invoices;
create policy owner_access on public.invoices
for all to authenticated
using (
  (select auth.uid()) = owner_user_id
  and exists (
    select 1
    from public.app_settings
    where app_settings.owner_user_id = (select auth.uid())
  )
)
with check (
  (select auth.uid()) = owner_user_id
  and exists (
    select 1
    from public.app_settings
    where app_settings.owner_user_id = (select auth.uid())
  )
);

drop policy owner_access on public.invoice_payments;
create policy owner_access on public.invoice_payments
for all to authenticated
using (
  (select auth.uid()) = owner_user_id
  and exists (
    select 1
    from public.app_settings
    where app_settings.owner_user_id = (select auth.uid())
  )
)
with check (
  (select auth.uid()) = owner_user_id
  and exists (
    select 1
    from public.app_settings
    where app_settings.owner_user_id = (select auth.uid())
  )
);

drop policy owner_access on public.cashflow_categories;
create policy owner_access on public.cashflow_categories
for all to authenticated
using (
  (select auth.uid()) = owner_user_id
  and exists (
    select 1
    from public.app_settings
    where app_settings.owner_user_id = (select auth.uid())
  )
)
with check (
  (select auth.uid()) = owner_user_id
  and exists (
    select 1
    from public.app_settings
    where app_settings.owner_user_id = (select auth.uid())
  )
);

drop policy owner_access on public.recurring_cashflows;
create policy owner_access on public.recurring_cashflows
for all to authenticated
using (
  (select auth.uid()) = owner_user_id
  and exists (
    select 1
    from public.app_settings
    where app_settings.owner_user_id = (select auth.uid())
  )
)
with check (
  (select auth.uid()) = owner_user_id
  and exists (
    select 1
    from public.app_settings
    where app_settings.owner_user_id = (select auth.uid())
  )
);

drop policy owner_access on public.planned_cashflows;
create policy owner_access on public.planned_cashflows
for all to authenticated
using (
  (select auth.uid()) = owner_user_id
  and exists (
    select 1
    from public.app_settings
    where app_settings.owner_user_id = (select auth.uid())
  )
)
with check (
  (select auth.uid()) = owner_user_id
  and exists (
    select 1
    from public.app_settings
    where app_settings.owner_user_id = (select auth.uid())
  )
);
