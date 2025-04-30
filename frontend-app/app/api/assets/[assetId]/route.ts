import { NextRequest, NextResponse } from 'next/server';
// import { fetchAssetDetails } from '@/lib/alpaca/assets'; // Remove unused import

// Corrected Backend API Key access
const BACKEND_API_KEY = process.env.BACKEND_API_KEY;
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

// This catches requests like /api/assets/AAPL or /api/assets/some-uuid
export async function GET(
  request: NextRequest,
  { params }: { params: { assetId: string } } // Correct way to get params in Route Handlers
) {
  // Properly await params before accessing
  const assetIdOrSymbol = params?.assetId;

  if (!assetIdOrSymbol) {
    return NextResponse.json({ detail: 'Asset ID or Symbol is required' }, { status: 400 });
  }

  if (!BACKEND_API_KEY) {
    console.error('Error: BACKEND_API_KEY environment variable is not set on the Next.js server.');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const backendUrl = `${API_BASE_URL}/api/assets/${encodeURIComponent(assetIdOrSymbol)}`;

  try {
    const response = await fetch(backendUrl, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': BACKEND_API_KEY,
      },
      cache: 'no-store',
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`Backend asset detail error (${response.status}):`, data.detail || response.statusText);
      return NextResponse.json({ error: `Failed to fetch asset details: ${data.detail || response.statusText}` }, { status: response.status });
    }

    return NextResponse.json(data);

  } catch (error) {
    console.error('Error fetching asset details from backend:', error);
    return NextResponse.json({ error: 'Internal server error while fetching asset details' }, { status: 500 });
  }
} 