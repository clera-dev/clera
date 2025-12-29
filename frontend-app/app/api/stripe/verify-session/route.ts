import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createClient } from '@/utils/supabase/server';
import { upsertUserPayment, mapSubscriptionToPaymentStatus } from '@/lib/stripe-payments';

export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json();

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }

    // Get the authenticated user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'customer'],
    });

    // Verify the session belongs to this user
    if (session.metadata?.userId !== user.id) {
      return NextResponse.json(
        { error: 'Session does not belong to this user' },
        { status: 403 }
      );
    }

    // Check payment status from Stripe
    let paymentStatus: 'active' | 'inactive' = 'inactive';
    let subscriptionId: string | null = null;
    let subscriptionStatus: string | null = null;
    
    if (session.mode === 'subscription') {
      if (session.subscription) {
        const subscription = typeof session.subscription === 'string'
          ? await stripe.subscriptions.retrieve(session.subscription)
          : session.subscription;
        
        subscriptionId = subscription.id;
        subscriptionStatus = subscription.status;
        paymentStatus = subscription.status === 'active' || subscription.status === 'trialing' 
          ? 'active' 
          : 'inactive';
      }
    } else {
      paymentStatus = session.payment_status === 'paid' ? 'active' : 'inactive';
    }

    // CRITICAL FIX: If session is complete and payment is active, UPDATE the database directly
    // This eliminates the race condition where webhook hasn't processed yet
    if (session.status === 'complete' && paymentStatus === 'active') {
      console.log(`[verify-session] Session complete, updating DB for user ${user.id}`);
      
      const customerId = typeof session.customer === 'string' 
        ? session.customer 
        : session.customer?.id;
      
      // Use shared utility for atomic upsert (same logic as webhook)
      const { success, error: upsertError } = await upsertUserPayment(user.id, {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        subscriptionStatus: subscriptionStatus,
        paymentStatus: paymentStatus,
      });
      
      if (!success) {
        console.error('[verify-session] Failed to upsert payment:', upsertError?.message);
      }
    }

    // Check if payment record exists in database (it should now after our update)
    const { data: paymentRecord } = await supabase
      .from('user_payments')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    return NextResponse.json({
      status: session.status,
      paymentStatus,
      hasPaymentRecord: !!paymentRecord,
      sessionId: session.id,
    });
  } catch (err: any) {
    console.error('Error verifying session:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to verify session' },
      { status: err.statusCode || 500 }
    );
  }
}

