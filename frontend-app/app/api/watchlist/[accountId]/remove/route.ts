import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function DELETE(
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

    // Parse request body
    const requestData = await request.json();
    const { symbol } = requestData;
    
    if (!symbol) {
      return NextResponse.json(
        { error: 'Symbol is required' },
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

    // Call backend API to remove symbol from watchlist
    console.log(`Removing symbol ${symbol} from watchlist for account ${accountId}`);
    const response = await fetch(`${backendUrl}/api/watchlist/${accountId}/remove`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': backendApiKey,
      },
      body: JSON.stringify({ symbol }),
      cache: 'no-store'
    });

    const responseBody = await response.text();
    
    if (!response.ok) {
      let errorDetail = `Backend request failed with status: ${response.status}`;
      try {
        const errorJson = JSON.parse(responseBody);
        errorDetail = errorJson.detail || errorDetail;
      } catch (e) {
        // If we can't parse JSON, use the raw text
        errorDetail = responseBody || errorDetail;
      }
      console.error(`Remove from Watchlist API Error - ${errorDetail}`);
      return NextResponse.json(
        { error: errorDetail },
        { status: response.status >= 500 ? 502 : response.status }
      );
    }

    let data;
    try {
      data = JSON.parse(responseBody);
    } catch (e) {
      console.error("Failed to parse backend JSON response.", e);
      return NextResponse.json(
        { error: 'Invalid response from backend service' },
        { status: 502 }
      );
    }

    return NextResponse.json(data);

  } catch (error) {
    console.error('Error removing from watchlist:', error);
    return NextResponse.json(
      { error: 'Failed to remove symbol from watchlist' },
      { status: 500 }
    );
  }
} 