create function public.preserve_engagement_conversion_link()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_has_reciprocal_link boolean;
begin
  select exists (
    select 1
    from public.opportunities
    where id = old.opportunity_id
      and owner_user_id = old.owner_user_id
      and converted_engagement_id = old.id
  )
  into v_has_reciprocal_link;

  if not v_has_reciprocal_link then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception using
      errcode = 'P0001',
      message = 'FC_CONVERSION_LINK_IMMUTABLE';
  end if;

  if
    new.id is distinct from old.id
    or new.owner_user_id is distinct from old.owner_user_id
    or new.opportunity_id is distinct from old.opportunity_id
  then
    raise exception using
      errcode = 'P0001',
      message = 'FC_CONVERSION_LINK_IMMUTABLE';
  end if;

  return new;
end;
$$;

revoke all on function public.preserve_engagement_conversion_link()
from public, anon, authenticated, service_role;

create trigger preserve_engagement_conversion_link
before update or delete
on public.engagements
for each row execute function public.preserve_engagement_conversion_link();
