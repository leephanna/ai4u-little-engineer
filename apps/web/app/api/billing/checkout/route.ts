/**
 * POST /api/billing/checkout
 *
 * Creates a Stripe Checkout Session for the given plan.
 * Returns { url } to redirect the user to Stripe's hosted checkout.
 *
 * Phase 2C: Stripe billing integration
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe, getStripePriceId, PLANS, type PlanId } from "@/lib/stripe/config";
import { getAuthUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { plan: PlanId };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { plan } = body;
  if (!plan || !PLANS[plan]) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  if (plan === "free") {
    return NextResponse.json({ error: "Cannot checkout free plan" }, { status: 400 });
  }

  const priceId = getStripePriceId(plan);
  if (!priceId) {
    return NextResponse.json(
      { error: `Stripe Price ID not configured for plan: ${plan}` },
      { status: 503 }
    );
  }

  const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://ai4u-little-engineer-web-lee-hannas-projects.vercel.app";

  try {
    const stripe = getStripe();
    const supabase = createServiceClient();

    // Look up or create Stripe customer for this user
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("clerk_user_id", user.id)
      .single();

    let customerId: string | undefined = profile?.stripe_customer_id ?? undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { clerk_user_id: user.id },
      });
      customerId = customer.id;

      // Persist the customer ID
      await supabase
        .from("profiles")
        .upsert({ clerk_user_id: user.id, stripe_customer_id: customerId });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing`,
      metadata: {
        clerk_user_id: user.id,
        plan,
      },
      subscription_data: {
        metadata: { clerk_user_id: user.id, plan },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    console.error("Stripe checkout error:", err);
    const message = err instanceof Error ? err.message : "Stripe error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
