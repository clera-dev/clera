import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

interface TransferHistoryItem {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  updated_at?: string;
  last_4?: string;
}

export async function GET(request: NextRequest) {
  try {
    // Create supabase server client
    const supabase = await createClient();
    
    // Verify user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();
    
    if (!user) {
      console.error("Transfer History API: User not authenticated");
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('Transfer History API: Fetching transfers for authenticated user');

    // Get user's Alpaca account ID
    const { data: onboardingData, error: onboardingError } = await supabase
      .from('user_onboarding')
      .select('alpaca_account_id')
      .eq('user_id', user.id)
      .single();

    if (onboardingError || !onboardingData?.alpaca_account_id) {
      console.error('Transfer History API: No Alpaca account found for authenticated user');
      return NextResponse.json(
        { error: 'No account found' },
        { status: 400 }
      );
    }

    const alpacaAccountId = onboardingData.alpaca_account_id;

    // Primary: Try to get real-time transfer data from backend
    let formattedTransfers: TransferHistoryItem[] = [];
    let usingBackendData = false;

    try {
      const backendUrl = process.env.BACKEND_API_URL || 'http://localhost:8000';
      const apiKey = process.env.BACKEND_API_KEY;

      if (apiKey) {
        console.log('Transfer History API: Fetching from backend for user account');
        
        // Use the dedicated transfers endpoint for comprehensive history
        const response = await fetch(`${backendUrl}/api/account/${alpacaAccountId}/transfers?limit=20&direction=INCOMING`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
        });

        if (response.ok) {
          const backendData = await response.json();
          
          if (backendData.success && backendData.transfers) {
            // Get bank account last 4 from user_bank_connections
            const { data: bankConnection } = await supabase
              .from('user_bank_connections')
              .select('last_4')
              .eq('user_id', user.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .single();

            const defaultLast4 = bankConnection?.last_4 || null;

            // Format transfers from backend (real-time Alpaca data)
            formattedTransfers = backendData.transfers.map((transfer: any) => {
              const parsedAmount = parseFloat(transfer.amount || '0');
              return {
                id: transfer.id || 'unknown',
                amount: isNaN(parsedAmount) ? 0 : parsedAmount,
                status: transfer.status || 'UNKNOWN',
                created_at: transfer.created_at,
                updated_at: transfer.updated_at,
                last_4: defaultLast4
              };
            });

            usingBackendData = true;
            console.log(`Transfer History API: Using backend transfers endpoint - ${formattedTransfers.length} transfers`);
          }
        }
      }
    } catch (backendError) {
      console.warn('Transfer History API: Backend API failed, falling back to Supabase:', backendError);
    }

    // Fallback: Use Supabase data if backend failed
    if (!usingBackendData) {
      console.log('Transfer History API: Using Supabase fallback');
      
      const { data: transfers, error: transferError } = await supabase
        .from('user_transfers')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (transferError) {
        console.error('Transfer History API: Supabase fallback error:', transferError);
        return NextResponse.json(
          { error: 'Failed to fetch transfer history' },
          { status: 500 }
        );
      }

      // Get bank account last 4
      const { data: bankConnection } = await supabase
        .from('user_bank_connections')
        .select('last_4')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const defaultLast4 = bankConnection?.last_4 || null;

      // Format Supabase transfers
      formattedTransfers = (transfers || []).map(transfer => {
        const parsedAmount = parseFloat(transfer.amount || '0');
        return {
          id: transfer.transfer_id || transfer.id,
          amount: isNaN(parsedAmount) ? 0 : parsedAmount,
          status: transfer.status || 'UNKNOWN',
          created_at: transfer.created_at,
          updated_at: transfer.updated_at,
          last_4: defaultLast4
        };
      });
    }

    console.log(`Transfer History API: Returning ${formattedTransfers.length} transfers (${usingBackendData ? 'real-time' : 'cached'})`);

    return NextResponse.json({
      success: true,
      transfers: formattedTransfers,
      source: usingBackendData ? 'alpaca' : 'supabase'
    });
    
  } catch (error) {
    console.error('Transfer History API: Unexpected error', error);
    return NextResponse.json(
      { error: 'Failed to fetch transfer history' },
      { status: 500 }
    );
  }
} 