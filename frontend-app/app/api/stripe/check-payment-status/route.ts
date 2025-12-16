import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
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

    // Check if user has an active payment record
    const { data: paymentRecord, error: paymentError } = await supabase
      .from('user_payments')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (paymentError && paymentError.code !== 'PGRST116') {
      // PGRST116 is "not found" which is fine
      console.error('Error checking payment status:', paymentError);
      return NextResponse.json(
        { error: 'Failed to check payment status' },
        { status: 500 }
      );
    }

    const hasActivePayment = paymentRecord && 
      (paymentRecord.payment_status === 'active' || 
       paymentRecord.subscription_status === 'active' ||
       paymentRecord.subscription_status === 'trialing');

    return NextResponse.json({
      hasActivePayment: !!hasActivePayment,
      paymentRecord: paymentRecord || null,
    });
  } catch (err: any) {
    console.error('Error checking payment status:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to check payment status' },
      { status: 500 }
    );
  }
}

