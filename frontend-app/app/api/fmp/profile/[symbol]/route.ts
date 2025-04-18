import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;

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

  const url = `https://financialmodelingprep.com/api/v3/profile/${symbol}?apikey=${apiKey}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const errorData = await response.text();
      console.error(`FMP API Error for profile ${symbol}: ${response.status} ${response.statusText}`, errorData);
      return NextResponse.json(
        { error: `Failed to fetch data from FMP: ${response.statusText}` },
        { status: response.status }
      );
    }
    const data = await response.json();

    if (Array.isArray(data) && data.length > 0) {
      return NextResponse.json(data[0]); 
    } else if (Array.isArray(data) && data.length === 0) {
      return NextResponse.json({ error: `No profile data found for symbol: ${symbol}` }, { status: 404 });
    } else {
      console.error(`Unexpected FMP API response format for profile ${symbol}:`, data);
      return NextResponse.json({ error: 'Received unexpected data format from FMP.' }, { status: 500 });
    }

  } catch (error) {
    console.error(`Error fetching FMP profile for ${symbol}:`, error);
    return NextResponse.json(
      { error: 'An internal server error occurred while fetching company profile.' },
      { status: 500 }
    );
  }
} 