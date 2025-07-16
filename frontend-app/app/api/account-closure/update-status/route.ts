import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { status, confirmationNumber } = body;

    // Validate status
    if (!['pending_closure', 'closed'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be pending_closure or closed' },
        { status: 400 }
      );
    }

    // Update user status in database
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    // Add confirmation number for pending_closure
    if (status === 'pending_closure' && confirmationNumber) {
      updateData.account_closure_confirmation_number = confirmationNumber;
    }

    const { data, error } = await supabase
      .from('user_onboarding')
      .update(updateData)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating user status:', error);
      return NextResponse.json(
        { error: 'Failed to update account status' },
        { status: 500 }
      );
    }

    console.log(`Updated user ${user.id} status to ${status}`);

    return NextResponse.json({
      success: true,
      status: data.status,
      message: `Account status updated to ${status}`
    });

  } catch (error) {
    console.error('Account status update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 