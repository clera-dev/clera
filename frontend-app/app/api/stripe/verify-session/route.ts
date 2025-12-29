import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createClient } from '@/utils/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

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
      
      // Use service role key to bypass RLS and ensure write succeeds
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      if (supabaseUrl && supabaseServiceKey) {
        const adminSupabase = createSupabaseClient(supabaseUrl, supabaseServiceKey);
        
        // Check if payment record exists
        const { data: existingPayment } = await adminSupabase
          .from('user_payments')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        
        const customerId = typeof session.customer === 'string' 
          ? session.customer 
          : session.customer?.id;
        
        const paymentRecord = {
          user_id: user.id,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          subscription_status: subscriptionStatus,
          payment_status: paymentStatus,
          updated_at: new Date().toISOString(),
        };
        
        if (existingPayment) {
          // Update existing record
          const { error: updateError } = await adminSupabase
            .from('user_payments')
            .update(paymentRecord)
            .eq('user_id', user.id);
          
          if (updateError) {
            console.error('[verify-session] Error updating payment record:', updateError);
          } else {
            console.log(`[verify-session] Updated payment record for user ${user.id}`);
          }
        } else {
          // Insert new record
          const { error: insertError } = await adminSupabase
            .from('user_payments')
            .insert({
              ...paymentRecord,
              created_at: new Date().toISOString(),
            });
          
          if (insertError) {
            console.error('[verify-session] Error creating payment record:', insertError);
          } else {
            console.log(`[verify-session] Created payment record for user ${user.id}`);
          }
        }
      } else {
        console.warn('[verify-session] Missing Supabase config, cannot update DB directly');
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

