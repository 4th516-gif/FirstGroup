-- Stonebound Performance — core tables for subscribers and PubMed feed
-- Apply via Supabase CLI: supabase db push (or dashboard SQL editor)

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Newsletter / subscriber leads (inserted via Edge Function with service role)
-- ---------------------------------------------------------------------------
create table if not exists public.stonebound_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  tier text not null check (tier in ('free', 'paid', 'unknown')),
  source text default 'subscribe_page',
  created_at timestamptz not null default now()
);

create unique index if not exists stonebound_subscribers_email_lower_idx
  on public.stonebound_subscribers (lower(email));

alter table public.stonebound_subscribers enable row level security;

-- No direct client access; Edge Function uses service role only.
create policy "stonebound_subscribers_no_select"
  on public.stonebound_subscribers for select
  using (false);

-- ---------------------------------------------------------------------------
-- PubMed articles (synced by Edge Function; public read for live site feed)
-- ---------------------------------------------------------------------------
create table if not exists public.pubmed_articles (
  id uuid primary key default gen_random_uuid(),
  pmid text not null unique,
  title text not null,
  journal text,
  pub_date text,
  authors text,
  hub_tags text[] not null default '{}',
  digest_finding text,
  digest_mechanism text,
  digest_implication text,
  abstract_excerpt text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists pubmed_articles_hub_tags_idx on public.pubmed_articles using gin (hub_tags);
create index if not exists pubmed_articles_created_at_idx on public.pubmed_articles (created_at desc);

alter table public.pubmed_articles enable row level security;

create policy "pubmed_articles_select_public"
  on public.pubmed_articles for select
  using (true);

-- Writes only via service role (sync function), not exposed to anon key
create policy "pubmed_articles_no_insert"
  on public.pubmed_articles for insert
  with check (false);

create policy "pubmed_articles_no_update"
  on public.pubmed_articles for update
  using (false);

create policy "pubmed_articles_no_delete"
  on public.pubmed_articles for delete
  using (false);
