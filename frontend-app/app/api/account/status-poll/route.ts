import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  try {
    // Verify user authentication
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse the request body to get account ID
    const { accountId } = await request.json();
    
    if (!accountId) {
      return NextResponse.json(
        { error: 'Account ID is required' },
        { status: 400 }
      );
    }

    // Call the backend API to get account status
    const backendUrl = process.env.BACKEND_API_URL;
    const backendApiKey = process.env.BACKEND_API_KEY;

    if (!backendUrl || !backendApiKey) {
      console.error('Backend configuration missing');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const response = await fetch(`${backendUrl}/api/account/${accountId}/status`, {
      method: 'GET',
      headers: {
        'X-API-Key': backendApiKey,
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user.id}`, // Use user ID as token for backend auth
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Backend request failed:', response.status, errorText);
      
      // If account not found or other backend error, return error for frontend to handle
      return NextResponse.json(
        { 
          error: response.status === 404 ? 'Account not found' : 'Failed to fetch account status',
          accountReady: false 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Determine if account is ready based on status
    // Account creation success states: APPROVED, ACTIVE
    // Pending states: APPROVAL_PENDING, AML_REVIEW  
    // Failed states: ACTION_REQUIRED, DISABLED, etc.
    const status = data.status || '';
    const accountReady = ['APPROVED', 'ACTIVE'].includes(status);
    const accountFailed = ['ACTION_REQUIRED', 'DISABLED', 'REJECTED'].includes(status);
    
    return NextResponse.json({
      ...data,
      accountReady,
      accountFailed,
      isPending: !accountReady && !accountFailed
    });

  } catch (error: any) {
    console.error('Error in account status poll API route:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'An unknown error occurred',
        accountReady: false 
      },
      { status: 500 }
    );
  }
}
