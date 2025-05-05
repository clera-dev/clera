import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
// Optional: import { createClient } from '@/utils/supabase/server';

// Define the structure of the expected response from the backend /get-ach-relationships
interface BackendACHRelationship {
  id: string;
  account_id: string;
  created_at: string;
  updated_at: string;
  status: string; // e.g., "ACTIVE", "PENDING", "CANCELLED"
  account_owner_name: string;
  bank_account_type: string; // e.g., "CHECKING", "SAVINGS"
  bank_account_number: string; // Full number - we need last 4
  bank_routing_number: string;
  nickname: string | null; // Often used as bank name
  processor_token: string | null;
}

// Define the structure returned to the frontend dashboard
interface AccountSummaryDetails {
  bankName?: string | null;
  bankAccountLast4?: string | null;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const alpacaAccountId = searchParams.get('accountId');

  if (!alpacaAccountId) {
    return NextResponse.json({ detail: 'Alpaca Account ID is required' }, { status: 400 });
  }

  const backendUrl = process.env.BACKEND_API_URL;
  if (!backendUrl) {
    console.error("Error: BACKEND_API_URL environment variable is not set.");
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Retrieve the backend API key securely from server-side environment variables
  const backendApiKey = process.env.BACKEND_API_KEY; 
  if (!backendApiKey) {
    console.error("Error: BACKEND_API_KEY environment variable is not set.");
    // Don't expose the missing key detail to the client
    return NextResponse.json({ detail: 'Backend authentication configuration error' }, { status: 500 });
  }

  // Use POST method as per backend endpoint definition for /get-ach-relationships
  // The backend expects a JSON body, not query parameters for this specific endpoint.
  const targetUrl = `${backendUrl}/get-ach-relationships`; 
  
  console.log(`Fetching ACH relationships from backend POST: ${targetUrl} for account: ${alpacaAccountId}`);

  try {
    const backendResponse = await fetch(targetUrl, {
      method: 'POST', // Changed to POST based on backend endpoint definition
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json', // Required for POST with JSON body
        'X-Api-Key': backendApiKey // Use the correct header name
      },
      body: JSON.stringify({ accountId: alpacaAccountId }), // Send accountId in the body
      cache: 'no-store' // Ensure fresh data is fetched
    });

    if (!backendResponse.ok) {
      let errorDetail = `Backend request failed with status: ${backendResponse.status}`;
      try {
        const errorBody = await backendResponse.json();
        errorDetail = errorBody.detail || errorDetail;
      } catch (parseError) {
        // Ignore if the error response is not JSON
      }
      console.error(`Backend error fetching ACH relationships: ${errorDetail}`);
      // Forward backend status code if possible, otherwise use 502 Bad Gateway
      return NextResponse.json({ detail: errorDetail }, { status: backendResponse.status >= 500 ? 502 : backendResponse.status });
    }

    // Backend returns { relationships: [...] }
    const backendData: { relationships: BackendACHRelationship[] } = await backendResponse.json();

    if (!backendData || !Array.isArray(backendData.relationships)) {
         console.error('Invalid response structure from backend /get-ach-relationships');
         return NextResponse.json({ detail: 'Invalid response from backend service' }, { status: 502 });
    }

    // Find the first active relationship (or the first one if none are active)
    const activeRelationship = backendData.relationships.find(r => r.status === 'ACTIVE');
    const relationshipToUse = activeRelationship || backendData.relationships[0]; 

    if (!relationshipToUse) {
      console.log(`No ACH relationships found for account ${alpacaAccountId}`);
      // Return success, but with empty details, let frontend decide how to display
      return NextResponse.json({ bankName: null, bankAccountLast4: null }, { status: 200 }); 
    }

    // Extract details
    const bankName = relationshipToUse.nickname || relationshipToUse.account_owner_name; // Fallback to owner name if nickname is missing
    const last4 = relationshipToUse.bank_account_number?.slice(-4); // Safely get last 4 digits

    const summaryDetails: AccountSummaryDetails = {
      bankName: bankName,
      bankAccountLast4: last4 || null, // Ensure null if last4 couldn't be extracted
    };

    console.log(`Returning account summary for ${alpacaAccountId}:`, summaryDetails);
    return NextResponse.json(summaryDetails, { status: 200 });

  } catch (error) {
    console.error("Unexpected error in /api/broker/account-summary:", error);
    return NextResponse.json({ detail: 'Internal server error' }, { status: 500 });
  }
} 