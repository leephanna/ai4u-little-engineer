/**
 * POST /api/billing/webhook
 *
 * Handles Stripe webhook events to keep subscription state in sync.
 *
 * Events handled:
 *   - checkout.session.completed       → activate subscription
 *   - customer.subscription.updated    → update plan/status
 *   - customer.subscription.deleted    → downgrade to free
 *   - invoice.payment_failed           → mark subscription as past_due
 *
 * Phase 2C: Stripe billing integration
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/config";
import type Stripe from "stripe";

export const runtime = "nodejs";

// Disable body parsing — Stripe requires the raw body for signature verification
export const dynamic = "force-dynamic";

async function getRawBody(req: NextRequest): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = req.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return NextResponse.json(
      { error: "Missing stripe-signature or webhook secret" },
      { status: 400 }
    );
  }

  const rawBody = await getRawBody(req);
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = await createClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;
        const plan = session.metadata?.plan ?? "maker";
        const subscriptionId = session.subscription as string;

        if (userId) {
          await supabase.from("profiles").upsert({
            id: userId,
            plan,
            stripe_subscription_id: subscriptionId,
            stripe_customer_id: session.customer as string,
            subscription_status: "active",
            plan_activated_at: new Date().toISOString(),
          });
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.supabase_user_id;
        const plan = sub.metadata?.plan ?? "maker";

        if (userId) {
          await supabase.from("profiles").upsert({
            id: userId,
            plan,
            stripe_subscription_id: sub.id,
            subscription_status: sub.status,
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.supabase_user_id;

        if (userId) {
          await supabase.from("profiles").upsert({
            id: userId,
            plan: "free",
            stripe_subscription_id: null,
            subscription_status: "canceled",
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Look up user by Stripe customer ID
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (profile) {
          await supabase.from("profiles").upsert({
            id: profile.id,
            subscription_status: "past_due",
          });
        }
        break;
      }

      default:
        // Ignore unhandled events
        break;
    }
  } catch (err) {
    console.error(`Error handling Stripe event ${event.type}:`, err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
