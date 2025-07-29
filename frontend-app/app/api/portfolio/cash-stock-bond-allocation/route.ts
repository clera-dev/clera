import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Types for better type safety
interface AuthenticatedUser {
  id: string;
  email?: string;
}

interface BackendConfig {
  url: string;
  apiKey?: string;
}

// Authentication helper
async function authenticateUser(): Promise<AuthenticatedUser> {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    console.error('Cash/Stock/Bond Allocation API: User authentication failed:', userError);
    throw new Error('Authentication required');
  }
  
  return { id: user.id, email: user.email };
}

// Authorization helper
async function verifyAccountOwnership(userId: string, accountId: string): Promise<void> {
  const supabase = await createClient();
  const { data: onboardingData, error: onboardingError } = await supabase
    .from('user_onboarding')
    .select('alpaca_account_id')
    .eq('user_id', userId)
    .eq('alpaca_account_id', accountId)
    .single();
  
  if (onboardingError || !onboardingData) {
    console.error('Cash/Stock/Bond Allocation API: Account ownership verification failed');
    throw new Error('Account not found or access denied');
  }
  
  console.log('Cash/Stock/Bond Allocation API: Account ownership verified');
}

// Configuration helper
function getBackendConfig(): BackendConfig {
  const backendUrl = process.env.BACKEND_API_URL;
  const backendApiKey = process.env.BACKEND_API_KEY;

  if (!backendUrl) {
    console.error("Cash/Stock/Bond Allocation API Route Error: Backend URL not configured.");
    throw new Error('Backend service configuration error');
  }

  return {
    url: backendUrl,
    apiKey: backendApiKey
  };
}

// Backend proxy helper
async function fetchFromBackend(config: BackendConfig, accountId: string): Promise<any> {
  const targetUrl = `${config.url}/api/portfolio/cash-stock-bond-allocation?account_id=${accountId}`;
  console.log('Cash/Stock/Bond Allocation API: Proxying request to backend');

  const headers: HeadersInit = {
    'Accept': 'application/json'
  };
  
  if (config.apiKey) {
    headers['X-API-Key'] = config.apiKey;
  }

  const response = await fetch(targetUrl, {
    method: 'GET',
    headers,
    cache: 'no-store', // Ensure fresh data for real-time portfolio values
  });

  if (!response.ok) {
    await handleBackendError(response);
  }

  return response.json();
}

// Error handling helper
async function handleBackendError(response: Response): Promise<never> {
  console.error(`Backend cash/stock/bond allocation error: ${response.status}`);
  
  if (response.status === 404) {
    throw new Error('No positions found for this account');
  }
  
  // For all other errors, do not leak backend error details
  throw new Error('An unexpected error occurred while fetching portfolio allocation.');
}

// Main handler - now focused on orchestration
export async function GET(request: NextRequest) {
  try {
    // Extract account ID from request
    const searchParams = request.nextUrl.searchParams;
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json({ detail: 'Account ID is required' }, { status: 400 });
    }

    console.log('Cash/Stock/Bond Allocation API: Processing allocation request');

    // Authenticate user
    const user = await authenticateUser();
    
    // Verify account ownership
    await verifyAccountOwnership(user.id, accountId);
    
    // Get backend configuration
    const config = getBackendConfig();
    
    // Fetch data from backend
    const data = await fetchFromBackend(config, accountId);
    
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error in cash/stock/bond allocation API route:', error);
    
    // Handle specific error types
    if (error instanceof Error) {
      if (error.message === 'Authentication required') {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }
      if (error.message === 'Account not found or access denied') {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      if (error.message === 'No positions found for this account') {
        return NextResponse.json({ detail: error.message }, { status: 404 });
      }
      if (error.message === 'Backend service configuration error') {
        return NextResponse.json({ detail: error.message }, { status: 500 });
      }
    }
    
    return NextResponse.json(
      { detail: 'Internal server error' },
      { status: 500 }
    );
  }
} 