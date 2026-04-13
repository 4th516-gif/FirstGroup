# Stripe + Supabase (PoC deployment checklist)

## What is wired today

- **Checkout**: `supabase/functions/create-checkout-session` creates a Stripe Checkout Session for the logged-in user (JWT required). The athlete page calls it via Netlify proxy: `/functions/create-checkout-session`.
- **Webhooks**: `supabase/functions/stripe-webhook` verifies `Stripe-Signature`, then syncs:
  - `payments` (status `paid` / `failed` / `refunded`, idempotent upserts)
  - `subscriptions` + `profiles.subscription_plan` / `profiles.plan` from `customer.subscription.*`
  - `audit_log` rows for visibility in the admin **Activity** tab
- **Netlify**: `website/_redirects` proxies `/webhooks/stripe` and `/functions/create-checkout-session` to Supabase Edge Functions.

## Supabase Edge Function secrets (required)

Set these in the Supabase project (Edge Function secrets):

- `STRIPE_SECRET_KEY` -- Stripe secret key (used by `create-checkout-session`)
- `STRIPE_WEBHOOK_SECRET` -- signing secret for the webhook endpoint
- `SUPABASE_SERVICE_ROLE_KEY` -- service role key (used by both functions)
- `SUPABASE_URL` -- `https://<project-ref>.supabase.co`
- `SUPABASE_ANON_KEY` -- publishable/anon key (used by `create-checkout-session` for `auth.getUser`)
- `SITE_URL` -- public site origin used for Checkout `success_url` / `cancel_url` (example: `https://ftpiq.netlify.app`)

Notes:

- `stripe-webhook` also accepts legacy `SERVICE_ROLE_KEY` if `SUPABASE_SERVICE_ROLE_KEY` is not set.
- After changing secrets, redeploy the functions so new versions pick up configuration as expected in your project.

## Stripe Dashboard configuration

Webhook URL (via Netlify proxy):

- `https://<your-netlify-domain>/webhooks/stripe`

Recommended events for this PoC:

- `checkout.session.completed`
- `invoice.paid`
- `invoice.payment_failed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `charge.refunded`

## Database mapping

- `subscription_plans.stripe_price_id_monthly` / `stripe_price_id_annual` must be real Stripe Price IDs (`price_...`), not placeholders.
- The webhook maps the subscription line item price to a plan row and writes `profiles.subscription_plan` to the plan `slug` (example: `athlete_pro`).

## Deploy commands (local)

```bash
supabase functions deploy create-checkout-session
supabase functions deploy stripe-webhook --no-verify-jwt
```

## Admin visibility

Users with `profiles.role = super_admin` can open `fueliq-admin.html` and use the **Activity** tab to read `audit_log` (includes Stripe webhook traffic).
