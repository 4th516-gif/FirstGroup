// ============================================================
//  Create Checkout Session -- Supabase Edge Function
//  Creates Stripe subscription checkout sessions for logged-in users.
//  Deploy: supabase functions deploy create-checkout-session
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://ftpiq.netlify.app";
const STRIPE_API_BASE = "https://api.stripe.com/v1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

type RequestBody = {
  planSlug?: string;
  billingCycle?: "monthly" | "annual";
};

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const profileId = userData.user.id;

    const payload = (await req.json().catch(() => ({}))) as RequestBody;
    const planSlug = payload.planSlug ?? "athlete_pro";
    const billingCycle = payload.billingCycle === "annual" ? "annual" : "monthly";

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("id, email, stripe_customer_id")
      .eq("id", profileId)
      .single();

    if (profileErr || !profile) {
      return json({ error: "Profile not found" }, 404);
    }

    const { data: plan, error: planErr } = await admin
      .from("subscription_plans")
      .select("id, slug, stripe_price_id_monthly, stripe_price_id_annual")
      .eq("slug", planSlug)
      .single();

    if (planErr || !plan) {
      return json({ error: "Subscription plan not found" }, 404);
    }

    const priceId = billingCycle === "annual"
      ? (plan.stripe_price_id_annual ?? null)
      : (plan.stripe_price_id_monthly ?? null);

    const priceOk = typeof priceId === "string" && /^price_[A-Za-z0-9]+$/.test(priceId);
    if (!priceOk) {
      return json({ error: "Plan is not Stripe-configured for selected billing cycle" }, 400);
    }

    let stripeCustomerId: string | null = profile.stripe_customer_id;

    if (!stripeCustomerId) {
      const customerParams = new URLSearchParams({
        email: profile.email,
        "metadata[supabase_profile_id]": profileId,
      });

      const customerRes = await fetch(`${STRIPE_API_BASE}/customers`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: customerParams,
      });

      const customer = await customerRes.json();
      if (!customerRes.ok) {
        return json({ error: customer?.error?.message ?? "Failed to create Stripe customer" }, 500);
      }

      stripeCustomerId = customer.id;

      await admin
        .from("profiles")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", profileId);
    }

    const checkoutParams = new URLSearchParams({
      mode: "subscription",
      customer: stripeCustomerId,
      success_url: `${SITE_URL}/fueliq-athlete-profile.html?checkout=success`,
      cancel_url: `${SITE_URL}/fueliq-athlete-profile.html?checkout=cancelled`,
      client_reference_id: profileId,
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      "metadata[supabase_profile_id]": profileId,
      "subscription_data[metadata][supabase_profile_id]": profileId,
      "subscription_data[metadata][plan_slug]": plan.slug,
      "subscription_data[metadata][billing_cycle]": billingCycle,
    });

    const checkoutRes = await fetch(`${STRIPE_API_BASE}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: checkoutParams,
    });

    const checkout = await checkoutRes.json();

    if (!checkoutRes.ok || !checkout.url) {
      return json({ error: checkout?.error?.message ?? "Failed to create checkout session" }, 500);
    }

    return json({ url: checkout.url, id: checkout.id }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, 500);
  }
});
