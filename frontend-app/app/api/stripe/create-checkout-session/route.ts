import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { stripe } from '@/lib/stripe';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  try {
    // Get the authenticated user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // CRITICAL: Check if user already has an active subscription to prevent double-billing
    // This is a safety net against race conditions and accidental duplicate checkouts
    // FAIL-CLOSED: If we can't verify, we don't create checkout (safer than double-billing)
    const { data: existingPayment, error: paymentQueryError } = await supabase
      .from('user_payments')
      .select('payment_status, subscription_status, stripe_subscription_id')
      .eq('user_id', user.id)
      .maybeSingle();

    // CRITICAL: Fail-closed on database errors to prevent double-billing
    // If we can't verify subscription status, it's safer to block than risk charging twice
    if (paymentQueryError) {
      console.error(`[create-checkout] CRITICAL: Database query failed for user ${user.id}:`, paymentQueryError);
      return NextResponse.json(
        { 
          error: 'Unable to verify subscription status. Please try again.',
          code: 'VERIFICATION_FAILED'
        },
        { status: 503 } // Service Unavailable - indicates temporary issue
      );
    }

    if (existingPayment) {
      const isActive = existingPayment.payment_status === 'active' || 
                       existingPayment.subscription_status === 'active' ||
                       existingPayment.subscription_status === 'trialing';
      
      if (isActive) {
        console.log(`[create-checkout] User ${user.id} already has active subscription, blocking duplicate`);
        return NextResponse.json(
          { 
            error: 'You already have an active subscription',
            hasActiveSubscription: true,
            redirectTo: '/portfolio'
          },
          { status: 409 } // Conflict status
        );
      }
      
      // If there's an existing subscription ID, verify its status with Stripe directly
      if (existingPayment.stripe_subscription_id) {
        try {
          const subscription = await stripe.subscriptions.retrieve(existingPayment.stripe_subscription_id);
          if (subscription.status === 'active' || subscription.status === 'trialing') {
            console.log(`[create-checkout] User ${user.id} has active Stripe subscription, blocking duplicate`);
            return NextResponse.json(
              { 
                error: 'You already have an active subscription',
                hasActiveSubscription: true,
                redirectTo: '/portfolio'
              },
              { status: 409 }
            );
          }
        } catch (stripeErr: any) {
          // ONLY continue if subscription doesn't exist (resource_missing)
          // For other errors (network, rate limit, 5xx), fail-closed to prevent double-billing
          if (stripeErr.code === 'resource_missing') {
            console.log(`[create-checkout] Subscription ${existingPayment.stripe_subscription_id} no longer exists, allowing new checkout`);
          } else {
            console.error(`[create-checkout] CRITICAL: Stripe verification failed for user ${user.id}:`, stripeErr);
            return NextResponse.json(
              { 
                error: 'Unable to verify subscription status. Please try again.',
                code: 'STRIPE_VERIFICATION_FAILED'
              },
              { status: 503 }
            );
          }
        }
      }
    }

    const headersList = await headers();
    const origin = headersList.get('origin') || request.nextUrl.origin;

    // Get the price ID from environment variable or use a default
    // You'll need to create a product and price in Stripe Dashboard and set this
    const priceId = process.env.STRIPE_PRICE_ID || '{{PRICE_ID}}';

    if (priceId === '{{PRICE_ID}}') {
      console.error('STRIPE_PRICE_ID is not set in environment variables');
      return NextResponse.json(
        { error: 'Stripe price ID not configured' },
        { status: 500 }
      );
    }

    console.log(`[create-checkout] Creating checkout session for user ${user.id}`);

    // Create Checkout Session for subscription
    const session = await stripe.checkout.sessions.create({
      customer_email: user.email || undefined,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription', // Subscription mode for recurring payments
      success_url: `${origin}/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/stripe/cancel`,
      metadata: {
        userId: user.id,
        userEmail: user.email || '',
      },
      subscription_data: {
        metadata: {
          userId: user.id,
        },
      },
      // Enable automatic tax collection
      automatic_tax: {
        enabled: true,
      },
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (err: any) {
    console.error('Error creating checkout session:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to create checkout session' },
      { status: err.statusCode || 500 }
    );
  }
}

