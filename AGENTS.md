# AGENTS.md

## Cursor Cloud specific instructions

### Overview

FuelIQ (a.k.a. "Fuel Transform Perform" / FTP IQ) is a sports nutrition and wearable data tracking platform for athletes. The codebase contains:

- **Static website** (`website/`): Two HTML pages — athlete profile and admin dashboard. No build step, no bundler, no framework. Supabase JS client loaded from CDN.
- **Supabase Edge Functions** (`supabase/functions/`): Three Deno/TypeScript functions — `whoop-oauth`, `polar-oauth`, `whoop-webhook`. These handle OAuth callbacks and webhook data from wearable devices.

### Running the website locally

```bash
cd website && python3 -m http.server 8080
```

Then browse to `http://localhost:8080/fueliq-athlete-profile.html` or `http://localhost:8080/fueliq-admin.html`. Both pages require Supabase auth; without a session they show loading/redirect states. The OAuth callback proxies in `_redirects` only work on Netlify (production: `ftpiq.netlify.app`).

### Type-checking edge functions

Deno is used to type-check the Supabase Edge Functions:

```bash
deno check supabase/functions/whoop-oauth/index.ts
deno check supabase/functions/polar-oauth/index.ts
deno check supabase/functions/whoop-webhook/index.ts
```

There is no linting config in this repo. Use `deno check` as the primary static analysis tool for edge functions.

### Deploying edge functions

Edge functions are deployed via the Supabase CLI (not included in the dev environment):

```bash
supabase functions deploy whoop-oauth --no-verify-jwt
supabase functions deploy polar-oauth --no-verify-jwt
supabase functions deploy whoop-webhook --no-verify-jwt
```

### Key caveats

- No `package.json`, no `node_modules`, no npm/pnpm/yarn dependencies. Everything is either CDN-loaded or Deno ESM imports.
- All data goes to a remote Supabase instance (project `bkdubocmtzruyojkknch`). There is no local database.
- The `mobile-app/` directory is an empty placeholder.
- `cleanup.sh` and `tools/optimize-for-ai.ps1` are utility scripts unrelated to the core product.
