# Cursor Prompt — Stonebound Performance Security Pass
## Complete handoff for remaining security tasks

---

You are continuing security hardening work on **Stonebound Performance**, a human-performance / nutrition PoC platform.

**Branch:** `cursor/stonebound-performance-ux-57e6`
**Tech stack:** Static HTML/JS site on Netlify (`website/` publish root), Supabase Postgres + Auth + Edge Functions (Deno/TypeScript), Stripe subscriptions, WHOOP/Polar/Garmin wearable integrations.
**No build step on the web layer** — plain HTML files with inline `<script>`, Supabase JS from CDN. Do not introduce a bundler or framework.
**No `node_modules`** for the web layer. Edge Functions use Deno ESM imports.

Three security issues were already fixed on a sibling branch and should be confirmed present or re-applied if missing:
- Polar client secret comment stripped from `supabase/functions/polar-oauth/index.ts`
- WHOOP client ID comment stripped from `supabase/functions/whoop-oauth/index.ts`
- CSP + HSTS headers added to `netlify.toml`

The tasks below are your scope. Work through them in priority order. Commit after each logically complete unit. Do not commit secrets.

---

## TASK 1 — XSS: Add HTML escape helper, apply to all innerHTML rendering
**Files:** `website/fueliq-admin.html`, `website/fueliq-athlete-profile.html`
**Priority:** HIGH — do this first

Every `renderUsers`, `renderSubs`, `renderInquiries`, `renderInstitutions`, `renderAudit` function in `fueliq-admin.html` uses template literals inside `innerHTML` with raw database values interpolated directly. Same pattern in `fueliq-athlete-profile.html` for `profileMeta`, biometrics, and supplements rendering.

**What to do:**

1. Add this helper function **once** near the top of the `<script>` block in each HTML file:
```js
function h(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
```

2. Wrap **every** database-originated value in `h()` wherever it appears inside an `innerHTML` template literal. This includes but is not limited to:
   - `fueliq-admin.html`: `u.full_name`, `u.email`, `u.sport`, `u.role`, `u.subscription_plan`, `i.name` (institution), `i.short_name`, `i.ncaa_division`, `i.city`, `i.state`, `i.license_type`, `i.subject` (inquiry), `i.name` (inquiry), `i.category`, `i.priority`, `i.status`, `r.actor_email`, `r.action`, `r.target_type`, `r.target_id`, all values from `r.new_values`
   - `fueliq-athlete-profile.html`: all values rendered into `profileMeta` innerHTML, supplement names/doses, biometric metric values from DB

3. The institution `name` in `<option>` elements already has a partial `replace(/</g, '&lt;')` escape — replace it with `h()`.

4. Values used only as HTML attribute values (e.g., `value="${i.id}"` where `i.id` is a UUID from Supabase) should also be wrapped in `h()` for defense in depth.

5. Static string labels (e.g., `['Weight', data.weight_kg]` where the key is hardcoded) do not need escaping — only values that originate from the database or user input.

6. Do not change any CSS classes, layout, or styling. This is a pure escaping change.

**Verify:** After applying, search for `innerHTML` in both files and confirm every `${}` interpolation inside a template literal either: (a) wraps a DB value in `h()`, (b) is a hardcoded string literal, or (c) is a numeric expression.

---

## TASK 2 — CORS: Lock `create-checkout-session` to Netlify origin
**File:** `supabase/functions/create-checkout-session/index.ts`
**Priority:** HIGH

Current code has `"Access-Control-Allow-Origin": "*"`. This should be locked to the deployed Netlify domain.

**What to do:**

1. Add a new constant after the existing env vars:
```ts
const ALLOWED_ORIGIN = Deno.env.get("SITE_URL") ?? "https://ftpiq.netlify.app";
```

2. Replace the `corsHeaders` object:
```ts
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
```

3. In the `OPTIONS` pre-flight handler, also validate the `Origin` header:
```ts
if (req.method === "OPTIONS") {
  const origin = req.headers.get("Origin") ?? "";
  if (origin !== ALLOWED_ORIGIN) {
    return new Response("Forbidden", { status: 403 });
  }
  return new Response("ok", { headers: corsHeaders });
}
```

4. At the top of the `POST` handler (after the method check, before the auth check), add:
```ts
const origin = req.headers.get("Origin") ?? "";
if (origin && origin !== ALLOWED_ORIGIN) {
  return json({ error: "Forbidden" }, 403);
}
```

Do not change any other logic in this function.

---

## TASK 3 — Config: Centralize anon key and public config into one file
**Files:** `website/index.html`, `website/dashboard.html`, `website/fueliq-athlete-profile.html`, `website/fueliq-admin.html` (read), new file `website/js/config.js` (create)
**Priority:** MEDIUM

The Supabase anon key, project URL, site URL, and OAuth client IDs are copy-pasted into four separate HTML files. The anon key is a Supabase *publishable* key (intentionally browser-visible by design — this is not a secret exposure), but having it in four places creates maintenance problems.

**What to do:**

1. Create `website/js/config.js` with exactly this content (using the values already present in the HTML files):
```js
// Public configuration — these are publishable/non-secret values.
// SUPABASE_ANON_KEY is intentionally browser-visible (Supabase architecture).
// Do not add service role keys, Stripe secret keys, or OAuth client secrets here.
window.SB_URL      = 'https://bkdubocmtzruyojkknch.supabase.co'
window.SB_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrZHVib2NtdHpydXlvamtrbmNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNDE0NDYsImV4cCI6MjA5MDgxNzQ0Nn0.O2JnNrCL_C-VhABKJHilx7EKHrGQ1t8IhMsWxMZFVlQ'
window.SITE_URL         = 'https://ftpiq.netlify.app'
window.WHOOP_CLIENT_ID  = '47f70a90-26dd-4885-926d-bd9256724d73'
window.POLAR_CLIENT_ID  = 'e45c4048-9a86-4878-b5bb-5ff897c8188c'
```

2. In each of the four HTML files, add this `<script>` tag **before** the existing inline `<script>` block (but after the Supabase CDN script tag):
```html
<script src="/js/config.js"></script>
```

3. In each HTML file's inline `<script>` block, replace the hardcoded constant declarations with references to the window globals:
```js
// Replace these four lines wherever they appear:
const SUPABASE_URL   = 'https://...'     →  const SUPABASE_URL   = window.SB_URL
const SUPABASE_ANON_KEY = 'eyJ...'       →  const SUPABASE_ANON_KEY = window.SB_ANON_KEY
const SITE_URL       = 'https://...'     →  const SITE_URL       = window.SITE_URL
const WHOOP_CLIENT_ID = '47f...'         →  const WHOOP_CLIENT_ID = window.WHOOP_CLIENT_ID
const POLAR_CLIENT_ID = 'e45...'         →  const POLAR_CLIENT_ID = window.POLAR_CLIENT_ID
```

4. Do not change any other logic.

**Note:** `index.html` uses `const` inside a function scope — adapt as needed (may already be `const` inside the script, just reassign from window global).

---

## TASK 4 — Rate limiting on Edge Functions
**Files:** `supabase/functions/create-checkout-session/index.ts`, `supabase/functions/whoop-webhook/index.ts`, `supabase/functions/polar-oauth/index.ts`, `supabase/functions/whoop-oauth/index.ts`
**Priority:** MEDIUM

None of the Edge Functions have rate limiting. Add a lightweight in-memory sliding-window limiter to each. Because Deno isolates are ephemeral this won't survive restarts, but it's sufficient for PoC and prevents single-session abuse.

**What to do:**

1. Create a shared rate limiter module at `supabase/functions/_shared/rate-limit.ts`:
```ts
const store = new Map<string, number[]>()

/**
 * Returns true if the request should be allowed, false if rate limit exceeded.
 * @param key      identifier (e.g. IP address or user ID)
 * @param maxReqs  max requests allowed in the window
 * @param windowMs sliding window in milliseconds
 */
export function checkRateLimit(key: string, maxReqs: number, windowMs: number): boolean {
  const now = Date.now()
  const timestamps = (store.get(key) ?? []).filter(t => now - t < windowMs)
  if (timestamps.length >= maxReqs) return false
  timestamps.push(now)
  store.set(key, timestamps)
  return true
}
```

2. In each Edge Function, import and apply the limiter at the very top of the request handler, before any auth or business logic:
```ts
import { checkRateLimit } from '../_shared/rate-limit.ts'

// Inside Deno.serve handler:
const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
if (!checkRateLimit(ip, MAX_REQS, WINDOW_MS)) {
  return new Response(JSON.stringify({ error: 'Too many requests' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
  })
}
```

3. Apply these limits per function:

| Function | MAX_REQS | WINDOW_MS | Rationale |
|---|---|---|---|
| `create-checkout-session` | 5 | 60_000 | Stripe customer creation; low legitimate volume |
| `whoop-oauth` | 10 | 60_000 | OAuth callback; bursty on reconnect |
| `polar-oauth` | 10 | 60_000 | Same |
| `whoop-webhook` | 60 | 60_000 | Data push; can be high-frequency from WHOOP |

4. For `whoop-webhook` and `stripe-webhook`, use the `x-forwarded-for` IP as the key. For `create-checkout-session`, use the authenticated user's Supabase ID as the key (available after the auth check) — but still apply the IP-level check first as a pre-auth guard.

---

## TASK 5 — Input validation in Edge Functions
**Files:** `supabase/functions/create-checkout-session/index.ts`, `supabase/functions/whoop-webhook/index.ts`
**Priority:** MEDIUM

**`create-checkout-session`:**

After parsing `payload` and before using `planSlug`, add:
```ts
const planSlug = typeof payload.planSlug === 'string' && /^[a-z0-9_]{1,50}$/.test(payload.planSlug)
  ? payload.planSlug
  : 'athlete_pro'
```
This replaces the existing `const planSlug = payload.planSlug ?? 'athlete_pro'` line.

**`whoop-webhook`:**

After signature verification passes and `eventType` is extracted from the payload, add a safelist check before the `switch` statement:
```ts
const ALLOWED_EVENT_TYPES = new Set([
  'workout.updated', 'workout.deleted',
  'recovery.updated', 'sleep.updated',
  'cycle.updated',
])
if (!ALLOWED_EVENT_TYPES.has(eventType)) {
  console.log(`Ignoring unknown event type: ${eventType}`)
  return new Response('Ignored', { status: 200 })
}
```

Also, wherever `userId` is extracted from the WHOOP payload and used in a Supabase query, validate UUID format:
```ts
if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
  console.error('Invalid userId in WHOOP payload:', userId)
  return new Response('Bad Request', { status: 400 })
}
```

Do not add validation to fields that are already validated by Supabase's parameterized query layer.

---

## TASK 6 — RLS policy audit and self-escalation prevention
**This task is investigative + SQL migration — run in Supabase SQL editor**
**Priority:** MEDIUM

Run this query in the Supabase SQL editor to check which tables have RLS enabled:
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

For every table where `rowsecurity = false`, enable it:
```sql
ALTER TABLE public.<table_name> ENABLE ROW LEVEL SECURITY;
```

Then run:
```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

Review the output against this expected access matrix:

| Table | User reads own | User writes own | Admin reads all | Service role writes |
|---|---|---|---|---|
| `profiles` | YES | YES (restricted cols) | YES | YES |
| `food_logs` | YES | YES | YES | — |
| `nutrition_targets` | YES (read) | NO | YES | YES |
| `energy_expenditure` | YES | NO | YES | YES |
| `daily_summaries` | YES | NO | YES | YES |
| `wearable_connections` | YES | YES | YES | YES |
| `institutions` | YES (read) | NO | YES | — |
| `subscriptions` | YES (read) | NO | YES | YES |
| `payments` | YES (read) | NO | YES | YES |
| `audit_log` | NO | NO | YES (super_admin) | YES (insert) |
| `inquiries` | YES (insert own) | NO | YES | — |

**Critical: self-escalation prevention on `profiles`.** Add or verify this policy exists:
```sql
-- Prevents users from changing their own role, subscription_plan, or stripe_customer_id
DROP POLICY IF EXISTS "Users update own profile restricted" ON public.profiles;
CREATE POLICY "Users update own profile restricted" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
    AND subscription_plan = (SELECT subscription_plan FROM public.profiles WHERE id = auth.uid())
    AND stripe_customer_id IS NOT DISTINCT FROM (SELECT stripe_customer_id FROM public.profiles WHERE id = auth.uid())
  );
```

Create a new migration file `supabase/migrations/20260414000200_rls_hardening.sql` containing all `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and new policy statements discovered as missing.

---

## TASK 7 — MFA / Phone 2FA for admin accounts
**Files:** `website/dashboard.html`, `website/fueliq-admin.html`, new migration
**Priority:** MEDIUM

Supabase Auth supports TOTP (authenticator app) via `supabase.auth.mfa.*` APIs. Implement a lightweight MFA enrollment gate for admin/super_admin users.

**What to do:**

1. Add migration `supabase/migrations/20260414000300_mfa_enrolled.sql`:
```sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mfa_enrolled boolean DEFAULT false;
```

2. In `website/dashboard.html`, after the role-routing logic that identifies the user as `admin` or `super_admin`, add an MFA check before allowing entry to the admin view:
```js
// After determining user is admin/super_admin:
const { data: factors } = await sb.auth.mfa.listFactors()
const hasTOTP = factors?.totp?.some(f => f.status === 'verified')
if (!hasTOTP) {
  // Show MFA enrollment prompt instead of routing to admin page
  showMFAEnrollmentPrompt()
  return
}
```

3. Implement `showMFAEnrollmentPrompt()` in `dashboard.html` using Supabase's TOTP enrollment flow:
   - Call `sb.auth.mfa.enroll({ factorType: 'totp' })` to get the QR code URI
   - Render a QR code (use `https://api.qrserver.com/v1/create-qr-code/?data=<uri>` for PoC — no library needed)
   - Accept the 6-digit code and call `sb.auth.mfa.challengeAndVerify({ factorId, code })`
   - On success: update `profiles.mfa_enrolled = true` and proceed to admin routing

4. For athletes (non-admin): MFA is optional. Add a soft prompt in `fueliq-athlete-profile.html` in the settings/notifications section: "Secure your account — add two-factor authentication" with a link that calls the same enrollment flow. Make it dismissible; do not gate access.

5. Match existing dark/light theme CSS variables. Do not add new CSS class patterns — reuse `.btn`, `.card`, `.toast` patterns already present.

---

## TASK 8 — WHOOP webhook replay protection
**File:** `supabase/functions/whoop-webhook/index.ts`
**Priority:** MEDIUM — small, targeted change

The signature verification extracts a timestamp from the WHOOP signature header but does not check whether the event is too old. Add a 300-second tolerance window.

Locate the `verifyWhoopSignature` function. After extracting `timestamp` and before the HMAC computation, add:
```ts
const eventTs = parseInt(timestamp, 10)
const nowSec = Math.floor(Date.now() / 1000)
if (isNaN(eventTs) || Math.abs(nowSec - eventTs) > 300) {
  return false
}
```

This mirrors the replay protection already implemented in `supabase/functions/stripe-webhook/index.ts`.

---

## TASK 9 — Admin UI action audit logging
**File:** `website/fueliq-admin.html`
**Priority:** MEDIUM

Currently `audit_log` only receives entries from the Stripe webhook. Admin actions taken in the browser UI are not recorded. Add logging for all write operations.

**What to do:**

1. Add a helper function near the top of the `<script>` block, after the `sb` client is created:
```js
async function logAdminAction(action, targetType, targetId, newValues = {}) {
  try {
    await sb.from('audit_log').insert({
      actor_email: currentUser?.email ?? 'unknown',
      action,
      target_type: targetType,
      target_id: String(targetId),
      new_values: newValues,
    })
  } catch (e) {
    console.warn('audit log failed', e)
  }
}
```

2. Call `logAdminAction` after every successful database write in the admin page. Specifically:

   - After `assignUserInstitution` succeeds:
     ```js
     await logAdminAction('assign_institution', 'profile', userId, { institution_id: institutionId, institution: inst?.name ?? null })
     ```

   - After `resolveInquiry` succeeds:
     ```js
     await logAdminAction('resolve_inquiry', 'inquiry', id, { status: 'resolved' })
     ```

   - If any future role-change or plan-change actions are added, log them the same way.

3. `currentUser` is already loaded during page init in the admin page — confirm the variable name and reference it correctly in the helper.

---

## TASK 10 — OAuth state CSRF validation (WHOOP + Polar)
**Files:** `website/fueliq-athlete-profile.html`, `supabase/functions/whoop-oauth/index.ts`, `supabase/functions/polar-oauth/index.ts`
**Priority:** LOW — implement after higher-priority tasks are done

OAuth without `state` validation is vulnerable to CSRF: an attacker can craft a callback URL that links their wearable account to a victim's Stonebound profile.

**What to do:**

**In `fueliq-athlete-profile.html`**, update `connectWhoop()` and `connectPolar()`:
```js
function generateState(userId) {
  const raw = `${userId}:${Date.now()}:${Math.random()}`
  // Store for validation on return
  sessionStorage.setItem('oauth_state', raw)
  return btoa(raw).replace(/=/g, '')
}

function connectWhoop() {
  const state = generateState(athleteId)
  const params = new URLSearchParams({
    client_id: WHOOP_CLIENT_ID,
    // ... existing params ...
    state,
  })
  window.location.href = `https://api.prod.whoop.com/oauth/oauth2/auth?${params}`
}
// Same pattern for connectPolar()
```

**In the OAuth callback Edge Functions** (`whoop-oauth`, `polar-oauth`), after extracting `state` from the query params:
```ts
const state = url.searchParams.get('state')
// For PoC: verify state is non-empty and is a valid base64 string containing the user's ID
// Full HMAC validation is the production approach; for now, at minimum reject empty state:
if (!state || state.length < 8) {
  return Response.redirect(`${SITE_URL}/fueliq-athlete-profile.html?whoop=error`)
}
```

Note: Full cryptographic state validation requires the Edge Function to know the expected state (stored either in a short-lived Supabase table or a signed cookie). For PoC, the minimum viable protection is rejecting callbacks with missing or trivially short state values. Add a TODO comment for full HMAC validation pre-production.

---

## Constraints — Do Not Do

- Do not add a build step, bundler, or npm dependencies to the web layer
- Do not refactor HTML/CSS that isn't related to a security task
- Do not change the visual design, layout, or color scheme
- Do not add new HTML pages
- Do not commit any real API keys, secrets, or OAuth credentials
- Do not modify the existing RLS policies that are working — only add new ones or fill gaps
- Keep all Edge Functions as Deno/TypeScript — do not introduce Node.js patterns
- Do not push to `main`; all work on `cursor/stonebound-performance-ux-57e6`

## Commit structure

Suggested commit sequence (one commit per task or per logical unit within a task):
1. `SEC-3: add h() XSS escape helper, apply to all innerHTML rendering`
2. `SEC-4: lock CORS on create-checkout-session to SITE_URL`
3. `SEC-6: centralize public config into website/js/config.js`
4. `SEC-7: add sliding-window rate limiting to all Edge Functions`
5. `SEC-8: add input validation to checkout and webhook functions`
6. `SEC-9: RLS hardening migration + self-escalation prevention`
7. `SEC-10: add MFA/TOTP enrollment gate for admin accounts`
8. `SEC-11: add replay window check to whoop-webhook signature verification`
9. `SEC-12: add logAdminAction helper, wire to all admin write operations`
10. `SEC-16: add OAuth state param to WHOOP + Polar connect flows`

## Reference files
- `docs/security-plan.md` — full audit with context, rationale, and code snippets for each issue
- `docs/STRIPE.md` — Stripe deployment checklist
- `docs/cursor-backlog.md` — broader feature/product backlog
- `docs/ios-alerts-plan.md` — iOS notification system planning
