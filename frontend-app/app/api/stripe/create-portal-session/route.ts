import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createClient } from '@/utils/supabase/server';

/**
 * Create a Stripe Customer Portal Session
 * 
 * This endpoint allows authenticated users to access the Stripe Customer Portal
 * where they can:
 * - Update payment methods
 * - View billing history
 * - Cancel or modify their subscription
 * - Download invoices
 * 
 * Prerequisites:
 * - User must be authenticated
 * - User must have a stripe_customer_id in user_payments table
 * 
 * @returns {sessionId: string, url: string} - Portal session ID and redirect URL
 */
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

    // Get the user's Stripe customer ID from our database
    const { data: paymentRecord, error: paymentError } = await supabase
      .from('user_payments')
      .select('stripe_customer_id, payment_status, subscription_status')
      .eq('user_id', user.id)
      .maybeSingle();

    if (paymentError) {
      console.error(`[create-portal-session] Database error for user ${user.id}:`, paymentError);
      return NextResponse.json(
        { error: 'Failed to retrieve payment information' },
        { status: 500 }
      );
    }

    // Check if user has a Stripe customer ID
    if (!paymentRecord?.stripe_customer_id) {
      console.log(`[create-portal-session] User ${user.id} has no Stripe customer ID`);
      return NextResponse.json(
        { 
          error: 'No subscription found. Please subscribe first.',
          code: 'NO_CUSTOMER'
        },
        { status: 404 }
      );
    }

    // SECURITY: Use server-controlled URL sources only
    // - process.env.NEXT_PUBLIC_APP_URL is set in deployment config (preferred)
    // - request.nextUrl.origin is server-parsed from the actual request URL (fallback)
    // NEVER use the client-controlled 'origin' header as it can be spoofed for phishing
    const returnOrigin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

    console.log(`[create-portal-session] Creating portal session for user ${user.id}, customer ${paymentRecord.stripe_customer_id}`);

    // Create a Stripe Customer Portal session
    // The portal is configured in the Stripe Dashboard under Settings > Billing > Customer Portal
    const session = await stripe.billingPortal.sessions.create({
      customer: paymentRecord.stripe_customer_id,
      return_url: `${returnOrigin}/dashboard`,
    });

    console.log(`[create-portal-session] Portal session created: ${session.id}`);

    return NextResponse.json({ 
      sessionId: session.id, 
      url: session.url 
    });
  } catch (err: any) {
    console.error('[create-portal-session] Error creating portal session:', err);
    
    // Handle specific Stripe errors
    if (err.type === 'StripeInvalidRequestError') {
      // Customer doesn't exist in Stripe or other validation error
      return NextResponse.json(
        { 
          error: 'Unable to access subscription management. Please contact support.',
          code: 'STRIPE_ERROR'
        },
        { status: 400 }
      );
    }
    
    // SECURITY: Return generic error to client, detailed error already logged server-side
    return NextResponse.json(
      { error: 'Failed to create portal session. Please try again later.' },
      { status: 500 }
    );
  }
}
