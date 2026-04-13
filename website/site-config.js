// ─────────────────────────────────────────────────────────────────────────────
//  Stonebound — Site Config
//  Load this BEFORE supabase JS on every page:
//    <script src="site-config.js"></script>
//    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//
//  Supabase project ref: bkdubocmtzruyojkknch
// ─────────────────────────────────────────────────────────────────────────────

window.STONEBOUND_CONFIG = {
  // ── Supabase ─────────────────────────────────────────────────────────────
  supabaseUrl:     'https://bkdubocmtzruyojkknch.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrZHVib2NtdHpydXlvamtrbmNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNDE0NDYsImV4cCI6MjA5MDgxNzQ0Nn0.O2JnNrCL_C-VhABKJHilx7EKHrGQ1t8IhMsWxMZFVlQ',

  // ── Site ─────────────────────────────────────────────────────────────────
  siteUrl:         'https://stonebound.netlify.app',

  // ── Wearable OAuth client IDs (public, not secrets) ─────────────────────
  whoopClientId:   '47f70a90-26dd-4885-926d-bd9256724d73',
  polarClientId:   'e45c4048-9a86-4878-b5bb-5ff897c8188c',

  // ── Stripe ───────────────────────────────────────────────────────────────
  // Product:  Stonebound PoC Pass ($29/mo)
  // IDs:      prod_UKMuCslJmkYQJe  /  price_1TLiB9RrlUwr2zCt0CiWMGFW
  //
  // HUMAN TODO before launch:
  //   1. Go to https://dashboard.stripe.com/settings/payment_methods
  //   2. Enable Card (and optionally Apple Pay / Google Pay)
  //   3. In Stripe Dashboard → Payment Links → Create, select the price above
  //      OR via CLI: stripe payment_links create --price price_1TLiB9RrlUwr2zCt0CiWMGFW --quantity 1
  //   4. Copy the resulting URL (e.g. https://buy.stripe.com/xxx) and replace REPLACE_ME below
  stripePaymentLinkPoCPass: 'REPLACE_ME',
}
