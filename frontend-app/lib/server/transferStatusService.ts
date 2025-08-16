import 'server-only';
import { TransferStatusData } from '@/lib/types/transfer';

function requireBackendConfig() {
  const backendUrl = process.env.BACKEND_API_URL;
  const backendApiKey = process.env.BACKEND_API_KEY;
  if (!backendUrl || !backendApiKey) {
    throw new Error('Backend configuration missing');
  }
  return { backendUrl, backendApiKey };
}

function encodeId(id: string): string {
  return encodeURIComponent(id);
}

export async function fetchTransferStatusFromBackend(params: {
  accountId: string;
  transferId: string;
  authToken: string;
}): Promise<TransferStatusData> {
  const { accountId, transferId, authToken } = params;
  const { backendUrl, backendApiKey } = requireBackendConfig();

  const safeAccountId = encodeId(accountId);
  const safeTransferId = encodeId(transferId);

  // 1) Try specific withdrawal-status endpoint (preferred for ACH transfers)
  const withdrawalRes = await fetch(
    `${backendUrl}/account-closure/withdrawal-status/${safeAccountId}/${safeTransferId}`,
    {
      method: 'GET',
      headers: {
        'X-API-Key': backendApiKey,
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      cache: 'no-store',
    }
  );

  if (withdrawalRes.ok) {
    const body = await withdrawalRes.json();
    return {
      status: body.transfer_status || body.status,
      transfer_completed: body.transfer_completed === true || body.transfer_completed === "true",
      amount: body.amount,
      created_at: body.created_at,
      updated_at: body.updated_at,
    };
  }

  // 2) Fallback: get all transfers for account and find our transfer ID (both directions)
  const transfersRes = await fetch(
    `${backendUrl}/api/account/${safeAccountId}/transfers?limit=50`,
    {
      method: 'GET',
      headers: {
        'X-API-Key': backendApiKey,
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      cache: 'no-store',
    }
  );

  if (!transfersRes.ok) {
    throw new Error(`Backend API responded with status: ${transfersRes.status}`);
  }

  const { transfers } = await transfersRes.json();
  const specific = Array.isArray(transfers)
    ? transfers.find((t: any) => t?.id === transferId)
    : undefined;

  if (!specific) {
    throw new Error('Transfer not found');
  }

  const status: string = String(specific.status || '').toUpperCase();
  return {
    status: specific.status,
    transfer_completed: ['SETTLED', 'COMPLETED'].includes(status),
    amount: specific.amount?.toString?.() ?? specific.amount,
    created_at: specific.created_at,
    updated_at: specific.updated_at,
  };
}


