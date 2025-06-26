import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    // Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get account ID from params
    const { accountId } = await params;
    
    if (!accountId) {
      return NextResponse.json(
        { error: 'Account ID is required' },
        { status: 400 }
      );
    }

    // Get backend configuration
    const backendUrl = process.env.BACKEND_API_URL;
    const backendApiKey = process.env.BACKEND_API_KEY;
    
    if (!backendUrl || !backendApiKey) {
      console.error('Missing backend API configuration');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Call backend API
    console.log(`Checking account closure readiness for account ${accountId}`);
    const response = await fetch(`${backendUrl}/account-closure/check-readiness/${accountId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': backendApiKey,
      },
      cache: 'no-store'
    });

    const responseBody = await response.text();

    if (!response.ok) {
      let errorDetail = `Backend request failed with status: ${response.status}`;
      try {
        const errorJson = JSON.parse(responseBody);
        errorDetail = errorJson.detail || errorDetail;
      } catch (e) {
        // Ignore parse errors
      }
      console.error(`Account closure readiness check error: ${errorDetail}`);
      return NextResponse.json(
        { detail: errorDetail },
        { status: response.status >= 500 ? 502 : response.status }
      );
    }

    let data;
    try {
      data = JSON.parse(responseBody);
    } catch (e) {
      console.error("Failed to parse backend JSON response:", e);
      return NextResponse.json(
        { detail: 'Invalid response from backend service' },
        { status: 502 }
      );
    }

    return NextResponse.json(data, { status: 200 });

  } catch (error) {
    console.error("Account closure readiness check error:", error);
    return NextResponse.json(
      { detail: 'Internal server error' },
      { status: 500 }
    );
  }
} 