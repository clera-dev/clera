import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Ensure this route is dynamic and handles raw body for webhook signature verification
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set');
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    );
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json(
      { error: `Webhook Error: ${err.message}` },
      { status: 400 }
    );
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        
        if (!userId) {
          console.error('No userId in checkout session metadata:', session.id);
          break;
        }
        
        // For subscriptions, we also need to handle subscription.created
        if (session.mode === 'subscription') {
          console.log('Subscription checkout completed:', session.id);
          
          // Get the subscription to check its status
          if (session.subscription) {
            const subscription = await stripe.subscriptions.retrieve(
              session.subscription as string
            );
            
            if (subscription.status === 'active' || subscription.status === 'trialing') {
              await updateUserPaymentStatus(userId, {
                stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
                stripeSubscriptionId: subscription.id,
                subscriptionStatus: subscription.status,
                paymentStatus: 'active',
              });
            }
          }
        } else {
          // One-time payment
          if (session.payment_status === 'paid') {
            await updateUserPaymentStatus(userId, {
              stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
              paymentStatus: 'active',
            });
          }
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const userId = subscription.metadata?.userId;
        
        if (!userId) {
          console.error('No userId in subscription metadata:', subscription.id);
          break;
        }
        
        await updateUserPaymentStatus(userId, {
          stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id,
          stripeSubscriptionId: subscription.id,
          subscriptionStatus: subscription.status,
          paymentStatus: subscription.status === 'active' || subscription.status === 'trialing' ? 'active' : 'inactive',
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const userId = subscription.metadata?.userId;
        
        if (!userId) {
          console.error('No userId in subscription metadata:', subscription.id);
          break;
        }
        
        await updateUserPaymentStatus(userId, {
          paymentStatus: 'inactive',
          subscriptionStatus: 'canceled',
        });
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as any; // Stripe webhook event data
        const subscriptionId = invoice.subscription;
        if (subscriptionId && typeof subscriptionId === 'string') {
          const subscription = await stripe.subscriptions.retrieve(
            subscriptionId
          );
          const userId = subscription.metadata?.userId;
          
          if (userId) {
            await updateUserPaymentStatus(userId, {
              paymentStatus: 'active',
            });
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as any; // Stripe webhook event data
        const subscriptionId = invoice.subscription;
        if (subscriptionId && typeof subscriptionId === 'string') {
          const subscription = await stripe.subscriptions.retrieve(
            subscriptionId
          );
          const userId = subscription.metadata?.userId;
          
          if (userId) {
            await updateUserPaymentStatus(userId, {
              paymentStatus: 'past_due',
            });
          }
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Error handling webhook:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

async function updateUserPaymentStatus(
  userId: string | undefined,
  paymentData: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    subscriptionStatus?: string;
    paymentStatus: 'active' | 'inactive' | 'past_due';
  }
) {
  if (!userId) {
    console.error('No userId provided to updateUserPaymentStatus');
    return;
  }

  // Use service role key for webhook operations to bypass RLS
  // Webhooks come from Stripe, not from authenticated users
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase configuration for webhook');
    throw new Error('Supabase configuration error');
  }

  const supabase = createSupabaseClient(supabaseUrl, supabaseServiceKey);
  
  // First, check if a payment record exists
  const { data: existingPayment } = await supabase
    .from('user_payments')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  const paymentRecord = {
    user_id: userId,
    stripe_customer_id: paymentData.stripeCustomerId,
    stripe_subscription_id: paymentData.stripeSubscriptionId,
    subscription_status: paymentData.subscriptionStatus,
    payment_status: paymentData.paymentStatus,
    updated_at: new Date().toISOString(),
  };

  if (existingPayment) {
    // Update existing record
    const { error } = await supabase
      .from('user_payments')
      .update(paymentRecord)
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating payment status:', error);
      throw error;
    }
  } else {
    // Insert new record
    const { error } = await supabase
      .from('user_payments')
      .insert({
        ...paymentRecord,
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Error creating payment record:', error);
      throw error;
    }
  }

  console.log(`Payment status updated for user ${userId}:`, paymentData.paymentStatus);
}

