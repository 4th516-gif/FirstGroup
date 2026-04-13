// ============================================================
//  Stripe Webhook -- Supabase Edge Function
//  Verifies Stripe signatures and syncs payments + subscriptions.
//  Deploy: supabase functions deploy stripe-webhook --no-verify-jwt
//  Secrets: STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY (or SERVICE_ROLE_KEY)
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://bkdubocmtzruyojkknch.supabase.co";
const SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");

if (!SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (or SERVICE_ROLE_KEY) env var");
}

if (!STRIPE_WEBHOOK_SECRET) {
  throw new Error("Missing STRIPE_WEBHOOK_SECRET env var");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function stripeId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") {
    return (value as { id: string }).id;
  }
  return null;
}

async function recordAudit(entry: {
  action: string;
  targetType: string;
  targetId: string;
  newValues?: Record<string, unknown>;
}) {
  const { error } = await supabase.from("audit_log").insert({
    actor_email: "stripe@system",
    action: entry.action,
    target_type: entry.targetType,
    target_id: entry.targetId,
    new_values: entry.newValues ?? null,
  });
  if (error) console.error("audit insert failed", error.message);
}

type StripeEvent = {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
};

async function verifyStripeSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  const pieces = signatureHeader.split(",");
  const timestamp = pieces.find((piece) => piece.startsWith("t="))?.slice(2);
  const sigV1 = pieces.find((piece) => piece.startsWith("v1="))?.slice(3);

  if (!timestamp || !sigV1) return false;

  const now = Math.floor(Date.now() / 1000);
  const eventTs = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(eventTs) || Math.abs(now - eventTs) > 300) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${payload}`),
  );
  const expected = Array.from(new Uint8Array(signed))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return expected === sigV1;
}

async function getProfileIdByCustomer(customerId: string | null | undefined): Promise<string | null> {
  const id = stripeId(customerId);
  if (!id) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", id)
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
}

async function getPlanByStripePriceId(priceId: string | null | undefined): Promise<{
  id: string;
  slug: string;
} | null> {
  if (!priceId || typeof priceId !== "string") return null;

  const { data: monthly, error: e1 } = await supabase
    .from("subscription_plans")
    .select("id, slug")
    .eq("stripe_price_id_monthly", priceId)
    .maybeSingle();
  if (e1) throw e1;
  if (monthly?.id) return monthly;

  const { data: annual, error: e2 } = await supabase
    .from("subscription_plans")
    .select("id, slug")
    .eq("stripe_price_id_annual", priceId)
    .maybeSingle();
  if (e2) throw e2;
  if (annual?.id) return annual;

  return null;
}

function firstSubscriptionPriceId(sub: Record<string, unknown>): string | null {
  const items = sub.items as { data?: Array<{ price?: { id?: string } }> } | undefined;
  const priceId = items?.data?.[0]?.price?.id;
  return priceId ?? null;
}

function mapStripeStatusToDb(status: unknown): string {
  if (typeof status !== "string") return "active";
  if (status === "canceled" || status === "cancelled") return "canceled";
  if (status === "incomplete_expired") return "canceled";
  return status;
}

async function upsertSubscriptionFromStripe(sub: Record<string, unknown>) {
  const stripeSubId = sub.id as string | undefined;
  if (!stripeSubId) return;

  const customerId = stripeId(sub.customer) ?? undefined;
  const profileId =
    (typeof sub.metadata === "object" && sub.metadata !== null &&
        typeof (sub.metadata as Record<string, unknown>).supabase_profile_id === "string"
      ? (sub.metadata as Record<string, string>).supabase_profile_id
      : null) ?? await getProfileIdByCustomer(customerId);

  if (!profileId) {
    console.log("stripe subscription: no profile for customer", customerId);
    return;
  }

  const priceId = firstSubscriptionPriceId(sub);
  const plan = await getPlanByStripePriceId(priceId);
  if (!plan) {
    console.log("stripe subscription: unknown price id", priceId);
    return;
  }

  const status = mapStripeStatusToDb(sub.status);
  const cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end);
  const currentPeriodStart = typeof sub.current_period_start === "number"
    ? new Date(sub.current_period_start * 1000).toISOString()
    : null;
  const currentPeriodEnd = typeof sub.current_period_end === "number"
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null;
  const trialStart = typeof sub.trial_start === "number"
    ? new Date(sub.trial_start * 1000).toISOString()
    : null;
  const trialEnd = typeof sub.trial_end === "number"
    ? new Date(sub.trial_end * 1000).toISOString()
    : null;
  const canceledAt = typeof sub.canceled_at === "number"
    ? new Date(sub.canceled_at * 1000).toISOString()
    : null;

  const interval = (items: Record<string, unknown>) => {
    const it = items as { data?: Array<{ price?: { recurring?: { interval?: string } } }> };
    const i = it.data?.[0]?.price?.recurring?.interval;
    return i === "year" ? "annual" : "monthly";
  };

  const billingCycle = interval(sub.items as Record<string, unknown>);

  const amountCents = typeof sub.items === "object" && sub.items !== null
    ? Number((sub.items as { data?: Array<{ price?: { unit_amount?: number } }> }).data?.[0]?.price
      ?.unit_amount ?? 0)
    : 0;

  const row = {
    profile_id: profileId,
    plan_id: plan.id,
    billing_cycle: billingCycle,
    status,
    stripe_customer_id: customerId ?? null,
    stripe_subscription_id: stripeSubId,
    stripe_price_id: priceId,
    trial_start: trialStart,
    trial_end: trialEnd,
    current_period_start: currentPeriodStart,
    current_period_end: currentPeriodEnd,
    canceled_at: canceledAt,
    cancel_at_period_end: cancelAtPeriodEnd,
    amount_cents: Number.isFinite(amountCents) ? amountCents : null,
    currency: typeof sub.currency === "string" ? sub.currency : "usd",
    updated_at: new Date().toISOString(),
  };

  const { data: existing, error: findErr } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("stripe_subscription_id", stripeSubId)
    .maybeSingle();
  if (findErr) throw findErr;

  if (existing?.id) {
    const { error: upErr } = await supabase.from("subscriptions").update(row).eq("id", existing.id);
    if (upErr) throw upErr;
  } else {
    const { error: insErr } = await supabase.from("subscriptions").insert(row);
    if (insErr) throw insErr;
  }

  const profilePlan = status === "active" || status === "trialing" ? plan.slug : "free";
  const { error: profErr } = await supabase
    .from("profiles")
    .update({
      subscription_plan: profilePlan,
      plan: profilePlan,
      stripe_customer_id: customerId ?? undefined,
    })
    .eq("id", profileId);
  if (profErr) throw profErr;

  await recordAudit({
    action: "stripe.subscription.synced",
    targetType: "stripe_subscription",
    targetId: stripeSubId,
    newValues: { profile_id: profileId, status, plan: plan.slug },
  });
}

async function upsertPaymentFromInvoice(inv: Record<string, unknown>, status: "paid" | "failed") {
  const customerId = stripeId(inv.customer) ?? undefined;
  const profileId = await getProfileIdByCustomer(customerId);
  if (!profileId) {
    console.log("invoice: no profile for customer", customerId);
    return;
  }

  const invoiceId = inv.id as string | undefined;
  const paymentIntent = stripeId(inv.payment_intent);
  const chargeId = stripeId(inv.charge);
  const amount = status === "paid"
    ? Number(inv.amount_paid ?? 0)
    : Number(inv.amount_due ?? 0);
  const currency = typeof inv.currency === "string" ? inv.currency : "usd";

  const payload = {
    profile_id: profileId,
    stripe_payment_intent_id: paymentIntent ?? null,
    stripe_invoice_id: invoiceId ?? null,
    stripe_charge_id: chargeId ?? null,
    amount_cents: amount,
    currency,
    status,
    description: status === "paid" ? `Invoice ${invoiceId}` : `Failed invoice ${invoiceId}`,
    paid_at: status === "paid" ? new Date().toISOString() : null,
  };

  if (invoiceId) {
    const { error } = await supabase.from("payments").upsert(payload, {
      onConflict: "stripe_invoice_id",
    });
    if (error) throw error;
  } else if (paymentIntent) {
    const { error } = await supabase.from("payments").upsert(payload, {
      onConflict: "stripe_payment_intent_id",
    });
    if (error) throw error;
  } else {
    const { error } = await supabase.from("payments").insert(payload);
    if (error) throw error;
  }

  const subscriptionId = stripeId(inv.subscription) ?? undefined;
  if (status === "paid" && subscriptionId) {
    const { error: subErr } = await supabase
      .from("subscriptions")
      .update({ status: "active", cancel_at_period_end: false, updated_at: new Date().toISOString() })
      .eq("stripe_subscription_id", subscriptionId);
    if (subErr) throw subErr;
  }

  await recordAudit({
    action: status === "paid" ? "stripe.invoice.paid" : "stripe.invoice.failed",
    targetType: "stripe_invoice",
    targetId: String(invoiceId ?? paymentIntent ?? "unknown"),
    newValues: { profile_id: profileId, amount_cents: amount, status },
  });
}

async function handleCheckoutSessionCompleted(session: Record<string, unknown>) {
  const customerId = stripeId(session.customer) ?? undefined;
  const profileId =
    (typeof session.client_reference_id === "string" && session.client_reference_id.length > 0
      ? session.client_reference_id
      : null) ??
      (typeof session.metadata === "object" && session.metadata !== null &&
          typeof (session.metadata as Record<string, unknown>).supabase_profile_id === "string"
        ? (session.metadata as Record<string, string>).supabase_profile_id
        : null);

  if (profileId && customerId) {
    const { error } = await supabase
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", profileId);
    if (error) throw error;
    await recordAudit({
      action: "stripe.checkout.session.completed",
      targetType: "profile",
      targetId: profileId,
      newValues: { stripe_customer_id: customerId },
    });
  }
}

async function handleSubscriptionDeleted(sub: Record<string, unknown>) {
  const stripeSubId = sub.id as string | undefined;
  if (!stripeSubId) return;

  const { error: subErr } = await supabase
    .from("subscriptions")
    .update({
      status: "canceled",
      cancel_at_period_end: true,
      canceled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", stripeSubId);
  if (subErr) throw subErr;

  const profileId = await getProfileIdByCustomer(stripeId(sub.customer) ?? undefined);
  if (!profileId) return;

  const { error: profErr } = await supabase
    .from("profiles")
    .update({ subscription_plan: "free", plan: "free" })
    .eq("id", profileId);
  if (profErr) throw profErr;

  await recordAudit({
    action: "stripe.subscription.deleted",
    targetType: "stripe_subscription",
    targetId: stripeSubId,
    newValues: { profile_id: profileId },
  });
}

async function handleChargeRefunded(charge: Record<string, unknown>) {
  const paymentIntentId = stripeId(charge.payment_intent);
  if (!paymentIntentId) return;

  const { error } = await supabase
    .from("payments")
    .update({
      status: "refunded",
      refunded_at: new Date().toISOString(),
    })
    .eq("stripe_payment_intent_id", paymentIntentId);
  if (error) throw error;

  await recordAudit({
    action: "stripe.charge.refunded",
    targetType: "stripe_payment_intent",
    targetId: paymentIntentId,
    newValues: {},
  });
}

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return new Response(JSON.stringify({ error: "Missing stripe-signature" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const rawBody = await req.text();
    const valid = await verifyStripeSignature(rawBody, signature, STRIPE_WEBHOOK_SECRET);
    if (!valid) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const event = JSON.parse(rawBody) as StripeEvent;
    const object = event.data?.object ?? {};

    console.log("stripe event", event.id, event.type);
    await recordAudit({
      action: "stripe.webhook.received",
      targetType: "stripe_event",
      targetId: event.id,
      newValues: { type: event.type },
    });

    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(object);
        break;
      case "invoice.paid":
        await upsertPaymentFromInvoice(object, "paid");
        break;
      case "invoice.payment_failed":
        await upsertPaymentFromInvoice(object, "failed");
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await upsertSubscriptionFromStripe(object);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(object);
        break;
      case "charge.refunded":
        await handleChargeRefunded(object);
        break;
      default:
        console.log("Unhandled event type", event.type);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("stripe webhook error", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
