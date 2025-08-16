import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/utils/api/auth-service';
import { fetchTransferStatusFromBackend, evaluateTransferState } from '@/utils/services/transfer-status-service';

export async function GET(request: NextRequest) {
  try {
    // Parse query parameters for GET request
    const { searchParams } = new URL(request.url);
    const transferId = searchParams.get('transferId');
    const accountId = searchParams.get('accountId');
    
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

    // Authenticate and authorize the user for this account; obtain validated JWT
    const authContext = await AuthService.authenticateAndAuthorize(request, accountId);

    // Delegate backend fetch + mapping to service layer
    let transferData;
    try {
      transferData = await fetchTransferStatusFromBackend({
        accountId: authContext.accountId,
        transferId,
        authToken: authContext.authToken,
      });
    } catch (error) {
      console.error('Backend request failed:', error);
      return NextResponse.json(
        { error: 'Failed to fetch transfer status', transferReady: false, transferFailed: true },
        { status: 500 }
      );
    }

    const flags = evaluateTransferState(transferData.status);
    return NextResponse.json({
      status: transferData.status,
      amount: transferData.amount,
      ...flags,
      transfer_completed: transferData.transfer_completed,
      created_at: transferData.created_at,
      updated_at: transferData.updated_at,
    });

  } catch (error: any) {
    // Handle authentication and authorization errors first
    const authError = AuthService.handleAuthError(error);
    if (authError.status !== 500) {
      return NextResponse.json(
        { error: authError.message, transferReady: false, transferFailed: true }, 
        { status: authError.status }
      );
    }

    console.error('Error in transfer status poll API route:', error);
    return NextResponse.json(
      { error: 'Internal server error', transferReady: false, transferFailed: true },
      { status: 500 }
    );
  }
}