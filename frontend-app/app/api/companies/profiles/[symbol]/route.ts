import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

interface CompanyProfile {
  id: string;
  symbol: string;
  company_name: string;
  price: number | null;
  beta: number | null;
  vol_avg: number | null;
  market_cap: number | null;
  last_div: number | null;
  range: string | null;
  changes: number | null;
  currency: string;
  cik: string | null;
  isin: string | null;
  cusip: string | null;
  exchange: string | null;
  exchange_short_name: string | null;
  industry: string | null;
  website: string | null;
  description: string | null;
  ceo: string | null;
  sector: string | null;
  country: string | null;
  full_time_employees: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  dcf_diff: number | null;
  dcf: number | null;
  image: string | null;
  ipo_date: string | null;
  default_image: boolean;
  is_etf: boolean;
  is_actively_trading: boolean;
  is_adr: boolean;
  is_fund: boolean;
  created_at: string;
  updated_at: string;
}

// Transform Supabase format to FMP format for consistency
function transformToFmpFormat(profile: CompanyProfile) {
  return {
    symbol: profile.symbol,
    price: profile.price,
    beta: profile.beta,
    volAvg: profile.vol_avg,
    mktCap: profile.market_cap,
    lastDiv: profile.last_div,
    range: profile.range,
    changes: profile.changes,
    companyName: profile.company_name,
    currency: profile.currency,
    cik: profile.cik,
    isin: profile.isin,
    cusip: profile.cusip,
    exchange: profile.exchange,
    exchangeShortName: profile.exchange_short_name,
    industry: profile.industry,
    website: profile.website,
    description: profile.description,
    ceo: profile.ceo,
    sector: profile.sector,
    country: profile.country,
    fullTimeEmployees: profile.full_time_employees,
    phone: profile.phone,
    address: profile.address,
    city: profile.city,
    state: profile.state,
    zip: profile.zip,
    dcfDiff: profile.dcf_diff,
    dcf: profile.dcf,
    image: profile.image,
    ipoDate: profile.ipo_date,
    defaultImage: profile.default_image,
    isEtf: profile.is_etf,
    isActivelyTrading: profile.is_actively_trading,
    isAdr: profile.is_adr,
    isFund: profile.is_fund
  };
}

// Fallback to FMP API if not found in Supabase
async function fetchFromFmpApi(symbol: string) {
  const apiKey = process.env.FINANCIAL_MODELING_PREP_API_KEY;
  
  if (!apiKey) {
    throw new Error('FMP API key not configured');
  }

  const url = `https://financialmodelingprep.com/api/v3/profile/${symbol}?apikey=${apiKey}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`FMP API error: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (Array.isArray(data) && data.length > 0) {
    return data[0];
  } else if (Array.isArray(data) && data.length === 0) {
    return null;
  } else {
    throw new Error('Unexpected FMP API response format');
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;

  if (!symbol) {
    return NextResponse.json({ error: 'Stock symbol is required' }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    
    // First, try to get data from Supabase
    const { data: profile, error } = await supabase
      .from('company_profiles')
      .select('*')
      .eq('symbol', symbol.toUpperCase())
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 is "row not found" error, which is expected if company not in DB
      console.error('Supabase error:', error);
      // Continue to FMP fallback instead of returning error
    }

    if (profile) {
      // Found in Supabase, return transformed data
      console.log(`Company profile for ${symbol} retrieved from Supabase cache`);
      return NextResponse.json(transformToFmpFormat(profile));
    }

    // Not found in Supabase, fallback to FMP API
    console.log(`Company profile for ${symbol} not found in cache, fetching from FMP API`);
    
    const fmpData = await fetchFromFmpApi(symbol);
    
    if (!fmpData) {
      return NextResponse.json(
        { error: `No profile data found for symbol: ${symbol}` }, 
        { status: 404 }
      );
    }

    // Optionally, store the FMP data in Supabase for future use
    // (This is a background operation and shouldn't block the response)
    const storeInBackground = async () => {
      try {
        const transformedForDb = {
          symbol: symbol.toUpperCase(),
          company_name: fmpData.companyName || '',
          price: fmpData.price || null,
          beta: fmpData.beta || null,
          vol_avg: fmpData.volAvg || null,
          market_cap: fmpData.mktCap || null,
          last_div: fmpData.lastDiv || null,
          range: fmpData.range || null,
          changes: fmpData.changes || null,
          currency: fmpData.currency || 'USD',
          cik: fmpData.cik || null,
          isin: fmpData.isin || null,
          cusip: fmpData.cusip || null,
          exchange: fmpData.exchange || null,
          exchange_short_name: fmpData.exchangeShortName || null,
          industry: fmpData.industry || null,
          website: fmpData.website || null,
          description: fmpData.description || null,
          ceo: fmpData.ceo || null,
          sector: fmpData.sector || null,
          country: fmpData.country || null,
          full_time_employees: fmpData.fullTimeEmployees || null,
          phone: fmpData.phone || null,
          address: fmpData.address || null,
          city: fmpData.city || null,
          state: fmpData.state || null,
          zip: fmpData.zip || null,
          dcf_diff: fmpData.dcfDiff || null,
          dcf: fmpData.dcf || null,
          image: fmpData.image || null,
          ipo_date: fmpData.ipoDate || null,
          default_image: fmpData.defaultImage || false,
          is_etf: fmpData.isEtf || false,
          is_actively_trading: fmpData.isActivelyTrading !== false, // Default to true
          is_adr: fmpData.isAdr || false,
          is_fund: fmpData.isFund || false
        };

        await supabase
          .from('company_profiles')
          .upsert(transformedForDb, { onConflict: 'symbol' });
        
        console.log(`Stored company profile for ${symbol} in Supabase cache`);
      } catch (storeError) {
        console.error(`Failed to store profile for ${symbol} in cache:`, storeError);
        // Don't throw error here as it's a background operation
      }
    };

    // Fire and forget the background storage
    storeInBackground();

    // Return the FMP data immediately
    return NextResponse.json(fmpData);

  } catch (error) {
    console.error(`Error fetching company profile for ${symbol}:`, error);
    return NextResponse.json(
      { error: 'An internal server error occurred while fetching company profile.' },
      { status: 500 }
    );
  }
} 