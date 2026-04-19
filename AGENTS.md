# AGENTS.md

## Stonebound Performance

Research-grounded performance and nutrition platform: static site in `website/` (shared `css/stonebound-shell.css` for navigation, skip link, focus rings, **Sisyphus moodboard URL list** in CSS comments, and surface classes `sb-surface-performance`, `sb-surface-nutrition`, `sb-surface-architecture`), Supabase Edge Functions in `supabase/functions/`, and SQL migrations in `supabase/migrations/`. No npm bundler — HTML pages with CDN scripts (Chart.js, Supabase JS).

### Run the site locally

```bash
cd website && python3 -m http.server 8080
```

Browse `http://localhost:8080/index.html` (landing), `performance.html`, `nutrition.html`, `architecture.html`, `feed.html`, `subscribe.html`.

### Configure Supabase

1. Apply migrations in `supabase/migrations/` in order (`*_stonebound_core.sql`, `*_stonebound_subscriber_count.sql`, `*_stonebound_subscribers_free_only.sql`) via SQL editor or `supabase db push`. The last migration restricts `stonebound_subscribers.tier` to `free` / `unknown` for the pre-launch single list.
2. Copy the **anon** key into `website/js/stonebound-config.js` (replace `YOUR_ANON_KEY`). Keep the project URL aligned with your instance. The subscribe page calls `stonebound_subscriber_count()` (SQL `count(*)`) via RPC for the public total — no row data is exposed.
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

- **Publish directory:** `website` (see root `netlify.toml`).
- **`website/_redirects`** proxies `/functions/subscribe-lead` and `/functions/pubmed-sync` to Supabase so the browser can call Edge Functions same-origin.
- **CLI (authenticated):** set `NETLIFY_AUTH_TOKEN`, then `npx netlify-cli deploy --dir=website --prod` from the repo root (links the site to your Netlify account).
- **Anonymous drop (temporary):** `npx netlify-cli deploy --dir=website --prod --allow-anonymous` gives a short-lived URL and password; claim the site in the Netlify UI before it expires.
