import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { upsertUserPayment, mapSubscriptionToPaymentStatus } from '@/lib/stripe-payments';

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
              await upsertUserPayment(userId, {
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
            await upsertUserPayment(userId, {
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
        
        await upsertUserPayment(userId, {
          stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id,
          stripeSubscriptionId: subscription.id,
          subscriptionStatus: subscription.status,
          paymentStatus: mapSubscriptionToPaymentStatus(subscription.status),
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
        
        await upsertUserPayment(userId, {
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
            await upsertUserPayment(userId, {
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
            await upsertUserPayment(userId, {
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

