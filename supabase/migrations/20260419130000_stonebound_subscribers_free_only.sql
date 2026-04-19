-- Pre-launch: only free list; normalize any legacy rows before tightening check
update public.stonebound_subscribers set tier = 'free' where tier = 'paid';

alter table public.stonebound_subscribers drop constraint if exists stonebound_subscribers_tier_check;
alter table public.stonebound_subscribers
  add constraint stonebound_subscribers_tier_check
  check (tier in ('free', 'unknown'));
