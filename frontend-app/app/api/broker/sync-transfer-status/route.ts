import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  try {
    // Create supabase server client
    const supabase = await createClient();
    
    // Verify user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();
    
    if (!user) {
      console.error("Sync Transfer Status API: User not authenticated");
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log(`Sync Transfer Status API: Syncing for user: ${user.id}`);

    // Get user's Alpaca account ID
    const { data: onboardingData, error: onboardingError } = await supabase
      .from('user_onboarding')
      .select('alpaca_account_id')
      .eq('user_id', user.id)
      .single();

    if (onboardingError || !onboardingData?.alpaca_account_id) {
      console.error('Sync Transfer Status API: No Alpaca account found for user:', user.id);
      return NextResponse.json(
        { error: 'No account found' },
        { status: 400 }
      );
    }

    const alpacaAccountId = onboardingData.alpaca_account_id;

    // Get current transfers from Supabase that might need updating
    const { data: supabaseTransfers, error: transferError } = await supabase
      .from('user_transfers')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['SUBMITTED', 'QUEUED']) // Only sync pending transfers
      .order('created_at', { ascending: false });

    if (transferError) {
      console.error('Sync Transfer Status API: Error fetching Supabase transfers:', transferError);
      return NextResponse.json(
        { error: 'Failed to fetch transfers' },
        { status: 500 }
      );
    }

    if (!supabaseTransfers || supabaseTransfers.length === 0) {
      console.log('Sync Transfer Status API: No pending transfers to sync');
      return NextResponse.json({
        success: true,
        message: 'No pending transfers to sync',
        updated: 0
      });
    }

    // Get real-time status from Alpaca
    const backendUrl = process.env.BACKEND_API_URL || 'http://localhost:8000';
    const apiKey = process.env.BACKEND_API_KEY;

    if (!apiKey) {
      console.error('Sync Transfer Status API: No backend API key');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    try {
      const response = await fetch(`${backendUrl}/api/account/${alpacaAccountId}/transfers?limit=50`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Backend API returned ${response.status}`);
      }

      const backendData = await response.json();
      
      if (!backendData.success || !backendData.transfers) {
        console.warn('Sync Transfer Status API: No transfer data from backend');
        return NextResponse.json({
          success: true,
          message: 'No transfer data available from backend',
          updated: 0
        });
      }

      // Create a map of Alpaca transfers by ID for quick lookup
      const alpacaTransfersMap = new Map();
      backendData.transfers.forEach((transfer: any) => {
        alpacaTransfersMap.set(transfer.id, transfer);
      });

      let updatedCount = 0;

      // Update each Supabase transfer that has a status change
      for (const supabaseTransfer of supabaseTransfers) {
        const alpacaTransfer = alpacaTransfersMap.get(supabaseTransfer.transfer_id);
        
        if (alpacaTransfer && alpacaTransfer.status !== supabaseTransfer.status) {
          console.log(`Sync Transfer Status API: Updating transfer ${supabaseTransfer.transfer_id} from ${supabaseTransfer.status} to ${alpacaTransfer.status}`);
          
          const { error: updateError } = await supabase
            .from('user_transfers')
            .update({
              status: alpacaTransfer.status,
              updated_at: alpacaTransfer.updated_at || new Date().toISOString()
            })
            .eq('transfer_id', supabaseTransfer.transfer_id);

          if (updateError) {
            console.error(`Sync Transfer Status API: Error updating transfer ${supabaseTransfer.transfer_id}:`, updateError);
          } else {
            updatedCount++;
          }
        }
      }

      console.log(`Sync Transfer Status API: Updated ${updatedCount} transfers`);

      return NextResponse.json({
        success: true,
        message: `Successfully synced transfer statuses`,
        updated: updatedCount,
        checked: supabaseTransfers.length
      });

    } catch (backendError) {
      console.error('Sync Transfer Status API: Backend API error:', backendError);
      return NextResponse.json(
        { error: 'Failed to fetch real-time transfer status' },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('Sync Transfer Status API: Unexpected error', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An unknown error occurred' },
      { status: 500 }
    );
  }
} 