# AGENTS.md

## Stonebound Performance

Research-grounded performance and nutrition platform: static site in `website/`, Supabase Edge Functions in `supabase/functions/`, and SQL migrations in `supabase/migrations/`. No npm bundler — HTML pages with CDN scripts (Chart.js, Supabase JS).

### Run the site locally

```bash
cd website && python3 -m http.server 8080
```

Browse `http://localhost:8080/index.html` (landing), `performance.html`, `nutrition.html`, `architecture.html`, `feed.html`, `subscribe.html`.

### Configure Supabase

1. Apply `supabase/migrations/20260419120000_stonebound_core.sql` to your Supabase project (SQL editor or `supabase db push`).
2. Copy the **anon** key into `website/js/stonebound-config.js` (replace `YOUR_ANON_KEY`). Keep the project URL aligned with your instance.
3. Deploy Edge Functions:

```bash
supabase functions deploy subscribe-lead --no-verify-jwt
supabase functions deploy pubmed-sync --no-verify-jwt
```

Set secrets: `NCBI_API_KEY` (recommended), `CRON_SECRET` (Bearer token for `pubmed-sync`), optional `PUBMED_DEFAULT_TERM`.

Schedule `pubmed-sync` via Supabase cron or external scheduler: `POST` with header `Authorization: Bearer YOUR_CRON_SECRET`.

### Type-check edge functions

```bash
deno check supabase/functions/subscribe-lead/index.ts
deno check supabase/functions/pubmed-sync/index.ts
```

### Netlify

`website/_redirects` proxies `/functions/*` to Supabase so the static site can call `subscribe-lead` and `pubmed-sync` same-origin when deployed.
