# Stonebound Performance — Cursor Backlog
## Planning Document (All PoC Remaining Work)

> **Branch for all web/backend work:** `cursor/stonebound-performance-ux-57e6`
> **iOS planning doc:** `docs/ios-alerts-plan.md`
> This document lists every remaining task, ordered by dependency, with enough detail for Cursor to implement without a live handoff.

---

## Environment Checklist (Do First, Blocks Everything Else)

### Netlify

- [ ] Confirm `netlify.toml` `publish = "website"` is respected on production deploy
- [ ] Add `https://<your-netlify-domain>/dashboard.html` to **Supabase Auth → URL Configuration → Redirect URLs**
- [ ] Add `https://<your-netlify-domain>/index.html` and `https://<netlify-preview-url>/dashboard.html` (wildcard for deploy previews: `https://**--<site-id>.netlify.app/dashboard.html`)
- [ ] Verify `website/_redirects` Stripe proxy is live: `curl -I https://<domain>/webhooks/stripe` should not 404

### Supabase Edge Function Secrets

Set in Supabase Dashboard → Project → Edge Functions → Secrets:

| Secret key | Where it comes from |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API Keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks → signing secret |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role key |
| `SUPABASE_URL` | `https://bkdubocmtzruyojkknch.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase → Settings → API → anon key |
| `SITE_URL` | `https://<your-netlify-domain>` |

After adding/changing secrets: **redeploy both functions.**

### Stripe Webhook Configuration

In Stripe Dashboard → Developers → Webhooks → Add endpoint:
- URL: `https://<your-netlify-domain>/webhooks/stripe`
- Events to subscribe:
  - `checkout.session.completed`
  - `invoice.paid`
  - `invoice.payment_failed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `charge.refunded`

Verify `subscription_plans` table has real `stripe_price_id_monthly` / `stripe_price_id_annual` values (not placeholder strings).

---

## Ticket 1 — Stripe Webhook Drift Audit

**Priority:** High (data integrity)
**Files:** `supabase/functions/stripe-webhook/index.ts`

**Task:** Compare the deployed function against the repo source.

Steps for Cursor:
1. Run `supabase functions deploy stripe-webhook --no-verify-jwt` to force redeploy from repo source
2. Confirm `stripeId()` helper handles both string and expanded object forms (already in current source — verify it's deployed)
3. Confirm `profiles.subscription_plan` is being set to the plan `slug` (not the Stripe price ID)
4. Test with Stripe CLI: `stripe trigger checkout.session.completed` — confirm `payments` row inserted and `profiles.plan` updated

---

## Ticket 2 — Demo Data Seed Script

**Priority:** High (blocks demo)
**Files:** new `supabase/seed-demo.sql` or `scripts/seed-demo.js`

**Task:** Ensure the demo user account has data to show in all UI tabs.

Required data:
- 1 row in `nutrition_targets` for main demo user (`calories_kcal`, `protein_g`, `sport_type`)
- 7 rows in `daily_summaries` (last 7 days, realistic calories burned, steps, sleep data)
- 5–10 rows in `food_logs` (spread across last 3 days, various meal types)
- 1 row in `institutions` — Stonebound Demo University already seeded via migration; confirm it exists
- Main demo user's `profiles.institution_id` set to `a0000000-0000-4000-8000-000000000001`
- Main demo user's `profiles.role` = `super_admin` (so admin tab is accessible in demo)
- At least 1 other user with `role = 'athlete'` linked to the same institution (to show license count)

Implement as SQL that can be run in Supabase SQL editor or via `supabase db reset`.

---

## Ticket 3 — Meal Logging UI (Athlete Page)

**Priority:** Medium
**Files:** `website/fueliq-athlete-profile.html`

**Task:** Add a basic food log entry form to the athlete profile page.

Requirements:
- Simple modal or inline panel (match existing dark/light theme patterns)
- Fields: meal type (breakfast/lunch/dinner/snack), food description (text), calories (number), protein_g (number), carbs_g (number), fat_g (number), logged_at (default now())
- On save: `INSERT INTO food_logs` via Supabase JS client with user's `id`
- On success: refresh daily summary totals displayed on page, show toast "Meal logged"
- Quick Log path: pre-fill meal type based on current time of day
- Do NOT build a food search / API integration — free-text entry only for PoC

Schema assumption for `food_logs`:
```sql
-- If this table doesn't exist, create via migration:
CREATE TABLE IF NOT EXISTS public.food_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id),
  meal_type text CHECK (meal_type IN ('breakfast','lunch','dinner','snack','other')),
  description text,
  calories int,
  protein_g numeric(6,1),
  carbs_g numeric(6,1),
  fat_g numeric(6,1),
  logged_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.food_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own logs" ON public.food_logs
  FOR ALL USING (auth.uid() = user_id);
```

---

## Ticket 4 — Nutrition Targets Admin UI

**Priority:** Medium
**Files:** `website/fueliq-admin.html`

**Task:** Allow super_admin to set nutrition targets for any athlete from the admin dashboard.

Requirements:
- Add a "Targets" column or expandable row to the existing Athletes table in the admin UI
- Fields: `calories_kcal`, `protein_g`, `carbs_g`, `fat_g`, `sport_type` (select: endurance / strength / team_sport / general)
- Read from `nutrition_targets` table by `user_id`; upsert on save
- Inline edit pattern (click to edit, save/cancel per row) — no full modal needed
- Visible only to `super_admin` and `admin` roles (already gated in admin HTML)

Schema assumption:
```sql
CREATE TABLE IF NOT EXISTS public.nutrition_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) UNIQUE,
  calories_kcal int,
  protein_g numeric(6,1),
  carbs_g numeric(6,1),
  fat_g numeric(6,1),
  sport_type text DEFAULT 'general',
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.nutrition_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage targets" ON public.nutrition_targets
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );
CREATE POLICY "Users read own targets" ON public.nutrition_targets
  FOR SELECT USING (auth.uid() = user_id);
```

---

## Ticket 5 — Garmin OAuth Edge Function

**Priority:** Low (WHOOP + Polar sufficient for PoC demo)
**Files:** `supabase/functions/garmin-oauth/index.ts` (new)

**Task:** Implement the Garmin OAuth callback handler at the same pattern as `whoop-oauth` and `polar-oauth`.

Notes:
- `website/_redirects` already proxies `/auth/garmin/callback` → Supabase function
- Garmin uses OAuth 1.0a (not 2.0) — requires request token exchange, different from WHOOP/Polar
- For PoC: stub a redirect-only handler that stores the token and redirects to dashboard, full data pull deferred
- Secrets needed: `GARMIN_CONSUMER_KEY`, `GARMIN_CONSUMER_SECRET`

---

## Ticket 6 — Coach Roster View

**Priority:** Low
**Files:** `website/dashboard.html`

**Task:** Add a coach-specific view to `dashboard.html` for seat holders with `subscription_plan = 'coach'` or `role = 'coach'`.

Requirements:
- Show list of athletes linked to coach via `coach_athlete_access` table (assumed to exist: `coach_id`, `athlete_id`, `granted_at`)
- Each athlete row: name, last log date, last wearable sync, today's calorie % of target
- Click-through to athlete's profile view (read-only subset of `fueliq-athlete-profile.html`)
- Gated: only render this view when user's profile role is `coach`

---

## Ticket 7 — Stripe Annual Price for `athlete_pro`

**Priority:** Low
**Files:** Stripe Dashboard config + `subscription_plans` table

**Task:** Create an annual billing price in Stripe and wire it up.

Steps:
1. In Stripe Dashboard: duplicate the monthly `athlete_pro` price, set billing_period = yearly with ~20% discount
2. Copy the new `price_...` ID
3. Update `subscription_plans` table: `UPDATE subscription_plans SET stripe_price_id_annual = 'price_...' WHERE slug = 'athlete_pro'`
4. Add an "Annual (save 20%)" billing toggle to the checkout button on `fueliq-athlete-profile.html`
5. Pass `price_id` as param to `create-checkout-session` (already accepts it — verify)

---

## Ticket 8 — E2E Test: Magic Link Redirect

**Priority:** Medium (confidence for demo)
**Files:** new `tests/e2e/` directory, `package.json`

**Task:** Add a single Playwright test that verifies the sign-in → dashboard redirect flow on the deployed site.

Steps:
1. `npm install --save-dev @playwright/test` (update `package.json`)
2. `playwright.config.js` pointing to `https://<netlify-domain>` (or localhost via `python3 -m http.server`)
3. Test: navigate to `index.html`, assert sign-in form renders, assert `?auth=required#sign-in` redirect works for protected pages
4. Do NOT test actual magic link delivery (email is external) — test the page state only

Add `"test:e2e": "playwright test"` to `package.json` scripts.

---

## Ticket 9 — Manual QA Runbook

**Priority:** High (demo readiness)
**Files:** new `docs/runbook.md`

**Task:** Write ordered demo script for Stonebound Performance PoC.

Structure:
1. Pre-demo environment checklist (secrets set, functions deployed, demo data seeded)
2. Demo flow: sign-in → dashboard routing → athlete profile (alerts, wearables, Stripe) → admin panel (athletes tab, institutions tab, activity/audit tab)
3. Stripe test mode: use card `4242 4242 4242 4242`, verify webhook fires and `audit_log` shows entry
4. Known rough edges to skip or handle gracefully during demo
5. Recovery steps if auth breaks or wearable shows disconnected

---

## Ticket 10 — iOS Architecture Decision Note

**Priority:** High (decision needed before Friday)
**Files:** new `docs/ios-architecture.md`

**Task:** Write a short decision note for the iOS approach. Two options:

**Option A — Authenticated WebView (fastest PoC)**
- Native shell: `WKWebView` loading `https://<netlify-domain>/dashboard.html`
- Auth: inject Supabase session token from native keychain into WebView via `evaluateJavaScript`
- Notifications: native `UNUserNotificationCenter` + push, as specified in `ios-alerts-plan.md`
- Pro: zero UI duplication; web gets updated, app gets it free
- Con: feels less native, limited deep-link control, poor offline behavior

**Option B — Native Swift UI + Supabase Swift client**
- Full native screens: sign-in, dashboard, athlete profile, notification prefs
- Supabase Swift client (`supabase-swift`) for auth + data
- Pro: better performance, full notification action support, offline caching
- Con: significant duplication of web UI logic, longer build time

**Recommendation for PoC:** Start with Option A for the demo recording (fastest), with notification system fully native (Option B patterns for alert delivery regardless of UI choice). Plan migration to B for post-demo polish.

Note in the doc: Universal Links require an `apple-app-site-association` file hosted at `https://<netlify-domain>/.well-known/apple-app-site-association` — add to `website/` directory and `_redirects` once provisioning profile is in hand.

---

## Dependency Map

```
Ticket 2 (seed data) ──────────────────────► Demo recording
Ticket 3 (meal logging UI) ──────────────────► Demo recording
Ticket 4 (nutrition targets admin) ──────────► Demo recording
Ticket 1 (stripe drift) ─────────────────────► Demo recording
Ticket 9 (runbook) ──────────────────────────► Demo recording

Ticket 5 (Garmin OAuth) ─────────────────────► Post-demo
Ticket 6 (coach roster) ─────────────────────► Post-demo
Ticket 7 (annual price) ─────────────────────► Post-demo
Ticket 8 (E2E test) ─────────────────────────► CI / pre-ship

Ticket 10 (iOS arch decision, Friday) ───────► ios-alerts-plan.md implementation
```

---

## What Cursor Should NOT Do

- Do not push to `main` — all work on `cursor/stonebound-performance-ux-57e6`
- Do not commit real API keys, service role keys, or Stripe secrets
- Do not add `node_modules` — no build step for web; Deno ESM for edge functions
- Do not create new pages beyond what's listed — extend existing HTML files
- Do not refactor existing HTML/CSS styling — match and extend existing inline patterns
- Do not add TypeScript or a bundler to the web layer — plain JS + CDN Supabase only
