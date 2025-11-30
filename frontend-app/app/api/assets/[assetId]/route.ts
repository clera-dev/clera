import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Corrected Backend API Key access
const BACKEND_API_KEY = process.env.BACKEND_API_KEY;
const BACKEND_URL = process.env.BACKEND_API_URL;

// This catches requests like /api/assets/AAPL or /api/assets/some-uuid
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  try {
    // CRITICAL FIX: Add user authentication for Plaid security lookups
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error('Asset Details API: User authentication failed:', userError);
      // Continue without user_id for backward compatibility (will use fallback)
    }

    // Ensure we have the params
    const { assetId } = await params;
    if (!assetId) {
      return NextResponse.json({ detail: 'Asset ID or Symbol is required' }, { status: 400 });
    }

    const assetIdOrSymbol = assetId;

    console.log(`Asset Details API: Fetching details for ${assetIdOrSymbol}${user ? ` (user: ${user.id})` : ' (no user)'}`);

    if (!BACKEND_API_KEY) {
      console.error('Error: BACKEND_API_KEY environment variable is not set on the Next.js server.');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    if (!BACKEND_URL) {
      console.error('Error: BACKEND_API_URL environment variable is not set.');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // SECURITY FIX: User ID now comes from JWT token in Authorization header, not query params
    // Backend will extract user_id from authenticated JWT token
    const backendUrl = `${BACKEND_URL}/api/assets/${encodeURIComponent(assetIdOrSymbol)}`;

    // Get JWT token from session for authentication
    const { data: { session } } = await supabase.auth.getSession();
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'x-api-key': BACKEND_API_KEY,
    };
    
    // Add JWT token if available
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }

    const response = await fetch(backendUrl, {
      headers,
      cache: 'no-store',
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`Backend asset detail error (${response.status}):`, data.detail || response.statusText);
      return NextResponse.json({ error: `Failed to fetch asset details: ${data.detail || response.statusText}` }, { status: response.status });
    }

    return NextResponse.json(data);

  } catch (error) {
    console.error('Error in asset details API route:', error);
    return NextResponse.json({ error: 'Internal server error while fetching asset details' }, { status: 500 });
  }
} 