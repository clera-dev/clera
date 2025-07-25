import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Function to fetch account balance from Alpaca API
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    // Create supabase server client to authenticate the user
    const supabase = await createClient();
    
    // Verify user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized access' },
        { status: 401 }
      );
    }
    
    // Extract account ID from path params
    const { accountId } = await params;
    
    if (!accountId) {
      return NextResponse.json(
        { success: false, message: 'Account ID is required' },
        { status: 400 }
      );
    }

    // Get backend API URL and key from environment variables
    const backendUrl = process.env.BACKEND_API_URL;
    const backendApiKey = process.env.BACKEND_API_KEY;
    
    if (!backendUrl || !backendApiKey) {
      console.error('Missing backend API configuration');
      return NextResponse.json(
        { success: false, message: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Sanitize accountId to prevent path-injection or request-smuggling attacks
    const safeAccountId = encodeURIComponent(accountId);

    // Call backend API to get account balance
    console.log(`Fetching balance for account ${safeAccountId} from backend`);
    const response = await fetch(`${backendUrl}/api/account/${safeAccountId}/balance`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': backendApiKey,
      },
      cache: 'no-store' // Ensure fresh data is fetched
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
      console.error('Backend API error:', errorData);
      
      // Return a properly formatted error response
      return NextResponse.json(
        { 
          success: false, 
          message: errorData.detail || `Failed to fetch balance: ${response.statusText}` 
        },
        { status: response.status }
      );
    }

    const balanceData = await response.json();
    
    // The backend now returns a structured response: { success: true, data: { ... } }
    // We need to pass that nested data object to the frontend
    if (balanceData.success && balanceData.data) {
      return NextResponse.json({
        success: true,
        data: {
          buying_power: parseFloat(balanceData.data.buying_power || 0),
          cash: parseFloat(balanceData.data.cash || 0),
          portfolio_value: parseFloat(balanceData.data.portfolio_value || 0),
          currency: balanceData.data.currency || 'USD'
        }
      });
    } else {
      // Use status from backend payload if available, otherwise default to 500
      const status =
        (typeof balanceData.status === 'number' && balanceData.status) ||
        (typeof balanceData.code === 'number' && balanceData.code) ||
        500;
      // Ensure msg is always a string to prevent TypeError
      let msg = balanceData.message;
      if (typeof msg !== 'string') {
        if (msg !== undefined && msg !== null) {
          try {
            msg = JSON.stringify(msg);
          } catch {
            msg = 'Failed to get balance data';
          }
        } else {
          msg = 'Failed to get balance data';
        }
      }
      return NextResponse.json({ success: false, message: msg }, { status });
    }

  } catch (error) {
    console.error('Error fetching account balance:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'An unexpected error occurred'
      },
      { status: 500 }
    );
  }
} 