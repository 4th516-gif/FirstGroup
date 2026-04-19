-- Public subscriber count for marketing (aggregate only; no row access)
create or replace function public.stonebound_subscriber_count()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint from public.stonebound_subscribers;
$$;

comment on function public.stonebound_subscriber_count() is
  'Total rows in stonebound_subscribers; safe to expose to anon for subscribe page.';

grant execute on function public.stonebound_subscriber_count() to anon, authenticated;
