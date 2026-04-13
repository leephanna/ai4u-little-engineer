/**
 * POST /api/marketplace/checkout
 *
 * Creates a Stripe Checkout Session for purchasing a paid design.
 * On success, Stripe redirects to /marketplace/success?session_id=...
 * The billing webhook handles payment confirmation and unlocks the design.
 *
 * Request body: { project_id: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe/config";
import { getAuthUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const serviceSupabase = createServiceClient();

        const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { project_id } = body as { project_id?: string };

    if (!project_id) {
      return NextResponse.json({ error: "Missing project_id" }, { status: 400 });
    }

    // Fetch the project — include trust policy fields for gate check
    const { data: project, error: projectError } = await serviceSupabase
      .from("projects")
      .select("id, title, description, price, is_public, stl_url, creator_id, created_by, trust_tier, marketplace_allowed")
      .eq("id", project_id)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // ── TRUST POLICY GATE ────────────────────────────────────────────────────
    // Hard enforcement: block purchase if trust policy has not approved this design.
    // marketplace_allowed defaults to FALSE; it is only set to TRUE after the
    // Trust Policy Engine evaluates a passing VPL result (trusted_commercial tier).
    if (!project.marketplace_allowed) {
      const tier = (project as { trust_tier?: string }).trust_tier ?? "unverified";
      return NextResponse.json(
        {
          error: "This design is not eligible for marketplace purchase.",
          reason: `Trust tier: ${tier}. Designs must pass VPL validation before they can be sold.`,
          trust_tier: tier,
          blocked_by: "trust_policy",
        },
        { status: 403 }
      );
    }
    // ── END TRUST POLICY GATE ────────────────────────────────────────────────

    if (!project.price || project.price <= 0) {
      return NextResponse.json({ error: "This design is free — no purchase needed." }, { status: 400 });
    }

    // Check if user already purchased this design
    const { data: existingPurchase } = await serviceSupabase
      .from("design_purchases")
      .select("id, status")
      .eq("project_id", project_id)
      .eq("buyer_id", user.id)
      .single();

    if (existingPurchase?.status === "completed") {
      return NextResponse.json(
        { error: "You already own this design.", already_purchased: true },
        { status: 409 }
      );
    }

    // Check if user is the creator (creators don't pay for their own designs)
    const isCreator =
      project.creator_id === user.id || project.created_by === user.id;
    if (isCreator) {
      return NextResponse.json(
        { error: "You are the creator of this design.", is_creator: true },
        { status: 409 }
      );
    }

    // Get or create Stripe customer for this user
    const { data: profile } = await serviceSupabase
      .from("profiles")
      .select("stripe_customer_id, email")
      .eq("id", user.id)
      .single();

    const stripe = getStripe();
    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? profile?.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await serviceSupabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    // Create a pending purchase record
    await serviceSupabase.from("design_purchases").upsert(
      {
        project_id,
        buyer_id: user.id,
        stripe_session_id: "pending_" + Date.now(),
        amount_paid: project.price,
        currency: "usd",
        status: "pending",
      },
      { onConflict: "project_id,buyer_id" }
    );

    const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(project.price * 100), // cents
            product_data: {
              name: project.title,
              description: project.description ?? "3D-printable design from Little Engineer",
              metadata: { project_id },
            },
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/marketplace/success?session_id={CHECKOUT_SESSION_ID}&project_id=${project_id}`,
      cancel_url: `${origin}/marketplace/${project_id}`,
      metadata: {
        type: "design_purchase",
        project_id,
        buyer_id: user.id,
      },
    });

    // Update the pending purchase with the real session ID
    await serviceSupabase
      .from("design_purchases")
      .update({ stripe_session_id: session.id })
      .eq("project_id", project_id)
      .eq("buyer_id", user.id);

    return NextResponse.json({ checkout_url: session.url });
  } catch (err) {
    console.error("Marketplace checkout error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
