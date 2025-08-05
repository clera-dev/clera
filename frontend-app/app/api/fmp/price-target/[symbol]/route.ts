import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  //const sessionId = params.id; // Access id directly from destructured params
  // Instead of directly accessing params.id, await params first:
  const { symbol } = await params;
  //const sessionId = id;

  //const symbol = params.symbol;
  const apiKey = process.env.FINANCIAL_MODELING_PREP_API_KEY;

  if (!apiKey) {
    console.error('FMP API key is not configured.');
    return NextResponse.json(
      { error: 'API key is not configured. Please contact support.' },
      { status: 500 }
    );
  }

  if (!symbol) {
    return NextResponse.json({ error: 'Stock symbol is required' }, { status: 400 });
  }

  // Corrected Endpoint based on FMP docs (v4 instead of stable? testing v4)
  // const url = `https://financialmodelingprep.com/stable/price-target-summary?symbol=${symbol}&apikey=${apiKey}`;
  const url = `https://financialmodelingprep.com/api/v4/price-target-summary?symbol=${symbol}&apikey=${apiKey}`;


  try {
    const response = await fetch(url);
    if (!response.ok) {
      const errorData = await response.text();
      console.error(`FMP API Error for price target ${symbol}: ${response.status} ${response.statusText}`, errorData);
       return NextResponse.json(
        { error: `Failed to fetch price target data from FMP: ${response.statusText}` },
        { status: response.status }
      );
    }
    const data = await response.json();

    // Price target summary seems to consistently return an array, often empty if no data
    if (Array.isArray(data) && data.length > 0) {
      return NextResponse.json(data[0]); // Return the first (and likely only) element
    } else if (Array.isArray(data) && data.length === 0) {
       return NextResponse.json({ /* return empty object or specific message if preferred */ }, { status: 200 }); // Return OK with empty data if none found
    } else {
      // Handle unexpected response format
      console.error(`Unexpected FMP API response format for price target ${symbol}:`, data);
      return NextResponse.json({ error: 'Received unexpected data format from FMP.' }, { status: 500 });
    }

  } catch (error) {
    console.error(`Error fetching FMP price target for ${symbol}:`, error);
    return NextResponse.json(
      { error: 'An internal server error occurred while fetching price target summary.' },
      { status: 500 }
    );
  }
} 