import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createClient } from '@/utils/supabase/server';

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

    // Check payment status
    let paymentStatus = 'inactive';
    if (session.mode === 'subscription') {
      if (session.subscription) {
        const subscription = typeof session.subscription === 'string'
          ? await stripe.subscriptions.retrieve(session.subscription)
          : session.subscription;
        
        paymentStatus = subscription.status === 'active' || subscription.status === 'trialing' 
          ? 'active' 
          : 'inactive';
      }
    } else {
      paymentStatus = session.payment_status === 'paid' ? 'active' : 'inactive';
    }

    // Check if payment record exists in database
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

