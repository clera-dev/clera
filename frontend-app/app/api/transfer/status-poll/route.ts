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

    // Parse the request body to get transfer ID and account ID
    const { transferId, accountId } = await request.json();
    
    if (!transferId) {
      return NextResponse.json(
        { error: 'Transfer ID is required' },
        { status: 400 }
      );
    }

    if (!accountId) {
      return NextResponse.json(
        { error: 'Account ID is required' },
        { status: 400 }
      );
    }

    // Call the backend API to get transfer status using existing endpoints
    const backendUrl = process.env.BACKEND_API_URL;
    const backendApiKey = process.env.BACKEND_API_KEY;

    if (!backendUrl || !backendApiKey) {
      console.error('Backend configuration missing');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    let transferData;
    
    try {
      // First try the specific withdrawal status endpoint (works for ACH transfers)
      const withdrawalResponse = await fetch(`${backendUrl}/account-closure/withdrawal-status/${accountId}/${transferId}`, {
        method: 'GET',
        headers: {
          'X-API-Key': backendApiKey,
          'Content-Type': 'application/json',
        },
      });

      if (withdrawalResponse.ok) {
        const withdrawalData = await withdrawalResponse.json();
        transferData = {
          status: withdrawalData.transfer_status || withdrawalData.status,
          transfer_completed: withdrawalData.transfer_completed || false,
          amount: withdrawalData.amount,
          created_at: withdrawalData.created_at,
          updated_at: withdrawalData.updated_at
        };
      } else {
        // Fallback: get all transfers and find our specific one
        const transfersResponse = await fetch(`${backendUrl}/api/account/${accountId}/transfers?limit=50&direction=INCOMING`, {
          method: 'GET',
          headers: {
            'X-API-Key': backendApiKey,
            'Content-Type': 'application/json',
          },
        });

        if (!transfersResponse.ok) {
          throw new Error(`Backend API responded with status: ${transfersResponse.status}`);
        }

        const transfersData = await transfersResponse.json();
        const specificTransfer = transfersData.transfers?.find((t: any) => t.id === transferId);
        
        if (!specificTransfer) {
          throw new Error('Transfer not found');
        }

        transferData = {
          status: specificTransfer.status,
          transfer_completed: ['SETTLED', 'COMPLETED'].includes(specificTransfer.status.toUpperCase()),
          amount: specificTransfer.amount.toString(),
          created_at: specificTransfer.created_at,
          updated_at: specificTransfer.updated_at
        };
      }
    } catch (error) {
      console.error('Backend request failed:', error);
      
      // If transfer not found or other backend error, return error for frontend to handle
      return NextResponse.json(
        { 
          error: 'Failed to fetch transfer status',
          transferReady: false,
          transferFailed: true
        },
        { status: 500 }
      );
    }

    // Determine if transfer is ready based on status
    // Transfer success states: COMPLETED, SETTLED, QUEUED (queued means accepted and processing)
    // Pending states: SUBMITTED, PENDING_REVIEW, PENDING
    // Failed states: FAILED, CANCELLED, REJECTED, RETURNED
    const status = (transferData.status || '').toUpperCase();
    const transferReady = ['COMPLETED', 'SETTLED'].includes(status);
    const transferFailed = ['FAILED', 'CANCELLED', 'REJECTED', 'RETURNED'].includes(status);
    
    return NextResponse.json({
      status: transferData.status,
      amount: transferData.amount,
      transferReady,
      transferFailed,
      isPending: !transferReady && !transferFailed,
      transfer_completed: transferData.transfer_completed,
      created_at: transferData.created_at,
      updated_at: transferData.updated_at
    });

  } catch (error: any) {
    console.error('Error in transfer status poll API route:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'An unknown error occurred',
        transferReady: false,
        transferFailed: true
      },
      { status: 500 }
    );
  }
}