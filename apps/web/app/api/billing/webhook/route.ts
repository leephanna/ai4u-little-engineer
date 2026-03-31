/**
 * POST /api/billing/webhook
 *
 * Handles Stripe webhook events to keep subscription state in sync.
 *
 * Events handled:
 *   - checkout.session.completed       → activate subscription, write subscriptions table
 *   - customer.subscription.updated    → update plan/status in both tables
 *   - customer.subscription.deleted    → downgrade to free in both tables
 *   - invoice.payment_failed           → mark as past_due
 *   - invoice.paid                     → refresh subscription status
 *
 * Phase 3: Full Stripe wiring — subscriptions table + invoice.paid
 * Fixed for Stripe SDK v20: current_period_end removed; use cancel_at or billing_cycle_anchor.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe/config";
import type Stripe from "stripe";

export const runtime = "nodejs";
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

/**
 * In Stripe SDK v20, `current_period_end` was removed from Subscription.
 * Use `cancel_at` (if set) or `billing_cycle_anchor` as the best proxy for
 * "when does this billing period end / when does the subscription renew".
 */
function getPeriodEnd(sub: Stripe.Subscription): string | null {
  const ts = sub.cancel_at ?? sub.billing_cycle_anchor;
  if (!ts) return null;
  return new Date(ts * 1000).toISOString();
}

/**
 * In Stripe SDK v20, Invoice.subscription was removed.
 * The subscription ID now lives in invoice.parent.subscription_details.subscription.
 */
function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent;
  if (!parent) return null;
  if (parent.type === "subscription_details") {
    const sub = parent.subscription_details?.subscription;
    if (typeof sub === "string") return sub;
    if (sub && typeof sub === "object" && "id" in sub) return (sub as Stripe.Subscription).id;
  }
  return null;
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

  const supabase = createServiceClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;
        const plan = (session.metadata?.plan ?? "maker") as string;
        const subscriptionId = session.subscription as string;
        const customerId = session.customer as string;

        // ── Design purchase unlock ──────────────────────────────────
        if (session.metadata?.type === "design_purchase") {
          const projectId = session.metadata?.project_id;
          const buyerId = session.metadata?.buyer_id;
          const amountTotal = (session.amount_total ?? 0) / 100;
          if (projectId && buyerId) {
            await supabase
              .from("design_purchases")
              .update({
                status: "completed",
                stripe_payment_id: typeof session.payment_intent === "string"
                  ? session.payment_intent
                  : null,
                amount_paid: amountTotal,
                completed_at: new Date().toISOString(),
              })
              .eq("project_id", projectId)
              .eq("buyer_id", buyerId);

            // Credit 80% earnings to the creator
            const { data: project } = await supabase
              .from("projects")
              .select("creator_id, created_by, earnings_total")
              .eq("id", projectId)
              .single();

            const creatorId = project?.creator_id ?? project?.created_by;
            if (creatorId) {
              const currentEarnings = Number(project?.earnings_total ?? 0);
              const creatorShare = Math.round(amountTotal * 0.8 * 100) / 100;
              await supabase
                .from("projects")
                .update({ earnings_total: currentEarnings + creatorShare })
                .eq("id", projectId);
            }
          }
          break;
        }

        if (!userId) break;

        let periodEnd: string | null = null;
        if (subscriptionId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            periodEnd = getPeriodEnd(sub);
          } catch { /* non-fatal */ }
        }

        await supabase.from("profiles").upsert({
          id: userId,
          plan,
          stripe_subscription_id: subscriptionId,
          stripe_customer_id: customerId,
          subscription_status: "active",
          plan_activated_at: new Date().toISOString(),
          current_period_end: periodEnd,
        });

        await supabase.from("subscriptions").upsert({
          user_id: userId,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          plan,
          status: "active",
          current_period_end: periodEnd,
          updated_at: new Date().toISOString(),
        }, { onConflict: "stripe_subscription_id" });

        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.supabase_user_id;
        const plan = (sub.metadata?.plan ?? "maker") as string;
        const periodEnd = getPeriodEnd(sub);

        if (!userId) break;

        await supabase.from("profiles").upsert({
          id: userId,
          plan,
          stripe_subscription_id: sub.id,
          subscription_status: sub.status,
          current_period_end: periodEnd,
        });

        await supabase.from("subscriptions").upsert({
          user_id: userId,
          stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
          stripe_subscription_id: sub.id,
          plan,
          status: sub.status,
          current_period_end: periodEnd,
          updated_at: new Date().toISOString(),
        }, { onConflict: "stripe_subscription_id" });

        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.supabase_user_id;

        if (!userId) break;

        await supabase.from("profiles").upsert({
          id: userId,
          plan: "free",
          stripe_subscription_id: null,
          subscription_status: "canceled",
          current_period_end: null,
        });

        await supabase.from("subscriptions").upsert({
          user_id: userId,
          stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
          stripe_subscription_id: sub.id,
          plan: "free",
          status: "canceled",
          current_period_end: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "stripe_subscription_id" });

        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
        const subscriptionId = getInvoiceSubscriptionId(invoice);

        if (!customerId) break;

        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (profile && subscriptionId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            const periodEnd = getPeriodEnd(sub);

            await supabase.from("profiles").update({
              subscription_status: "active",
              current_period_end: periodEnd,
            }).eq("id", profile.id);

            await supabase.from("subscriptions").update({
              status: "active",
              current_period_end: periodEnd,
              updated_at: new Date().toISOString(),
            }).eq("stripe_subscription_id", subscriptionId);
          } catch { /* non-fatal */ }
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;

        if (!customerId) break;

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

          const subId = getInvoiceSubscriptionId(invoice);
          if (subId) {
            await supabase.from("subscriptions").update({
              status: "past_due",
              updated_at: new Date().toISOString(),
            }).eq("stripe_subscription_id", subId);
          }
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error(`Error handling Stripe event ${event.type}:`, err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
