/**
 * Shared Stripe Payment Utilities
 * 
 * This module provides atomic database operations for payment records.
 * Used by both verify-session and webhook handlers to ensure consistent behavior.
 * 
 * CRITICAL: Any changes here affect both payment flows - test thoroughly!
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export interface PaymentData {
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  subscriptionStatus?: string | null;
  paymentStatus: 'active' | 'inactive' | 'past_due';
}

/**
 * Atomically upsert a user's payment record in the database.
 * 
 * Uses Supabase's upsert with onConflict to prevent race conditions when
 * both verify-session and webhook execute simultaneously.
 * 
 * @param userId - The user's UUID
 * @param paymentData - Payment information to store
 * @returns Object with success boolean and optional error
 */
export async function upsertUserPayment(
  userId: string,
  paymentData: PaymentData
): Promise<{ success: boolean; error?: Error }> {
  if (!userId) {
    console.error('[stripe-payments] No userId provided to upsertUserPayment');
    return { success: false, error: new Error('No userId provided') };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[stripe-payments] Missing Supabase configuration');
    return { success: false, error: new Error('Supabase configuration error') };
  }

  const supabase = createSupabaseClient(supabaseUrl, supabaseServiceKey);

  // ATOMIC OPERATION: Use upsert to prevent race condition
  // Both webhook and verify-session can execute simultaneously
  // upsert with onConflict ensures only one record exists per user
  const { error } = await supabase
    .from('user_payments')
    .upsert({
      user_id: userId,
      stripe_customer_id: paymentData.stripeCustomerId,
      stripe_subscription_id: paymentData.stripeSubscriptionId,
      subscription_status: paymentData.subscriptionStatus,
      payment_status: paymentData.paymentStatus,
      updated_at: new Date().toISOString(),
    }, { 
      onConflict: 'user_id',
      ignoreDuplicates: false // Update if exists
    });

  if (error) {
    console.error('[stripe-payments] Error upserting payment record:', error);
    return { success: false, error: new Error(error.message) };
  }

  console.log(`[stripe-payments] Payment upserted for user ${userId}: ${paymentData.paymentStatus}`);
  return { success: true };
}

/**
 * Determine payment status from Stripe subscription status
 * 
 * Stripe subscription statuses:
 * - active: Payment confirmed, subscription is active
 * - trialing: In trial period (treated as active)
 * - past_due: Payment failed but in grace period (customer can still access)
 * - canceled: Subscription ended
 * - unpaid: Payment failed, grace period expired
 * - incomplete: Initial payment failed
 * - incomplete_expired: Initial payment failed and expired
 * - paused: Subscription paused (treated as inactive)
 */
export function mapSubscriptionToPaymentStatus(
  subscriptionStatus: string
): 'active' | 'inactive' | 'past_due' {
  switch (subscriptionStatus) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
      // Grace period - customer should still have access but needs to update payment
      return 'past_due';
    default:
      // canceled, unpaid, incomplete, incomplete_expired, paused
      return 'inactive';
  }
}

