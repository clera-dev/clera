import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

// Initialize Plaid client
const plaidConfig = new Configuration({
  basePath: process.env.PLAID_ENV === 'sandbox' 
    ? PlaidEnvironments.sandbox 
    : PlaidEnvironments.development,
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID || '',
      'PLAID-SECRET': process.env.PLAID_SECRET || '',
    },
  },
});

const plaidClient = new PlaidApi(plaidConfig);

export async function POST(request: Request) {
  try {
    // Verify user authentication
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Parse the request body
    const requestData = await request.json();
    const userEmail = requestData.email;
    const redirectUri = requestData.redirectUri;
    
    if (!userEmail) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Fetch the Alpaca account ID from Supabase
    const { data: onboardingData, error: supabaseError } = await supabase
      .from('user_onboarding')
      .select('alpaca_account_id')
      .eq('user_id', user.id)
      .single();
    
    if (supabaseError || !onboardingData?.alpaca_account_id) {
      console.error('Error fetching Alpaca account ID:', supabaseError || 'No account ID found');
      return NextResponse.json(
        { error: 'Could not find Alpaca account ID' },
        { status: 404 }
      );
    }
    
    const alpacaAccountId = onboardingData.alpaca_account_id;
    
    // Call the backend to get an Alpaca-Plaid Link URL
    const backendUrl = `${process.env.BACKEND_API_URL}/create-ach-relationship-link`;
    console.log('Calling backend for Plaid link:', backendUrl);
    
    const backendResponse = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.BACKEND_API_KEY || ''
      },
      body: JSON.stringify({
        accountId: alpacaAccountId,
        email: userEmail,
        redirectUri: redirectUri || `${process.env.NEXT_PUBLIC_BASE_URL}/protected`
      })
    });
    
    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      
      // Log error status only to prevent PII exposure
      console.error('Backend API error status:', backendResponse.status);
      
      // Return a generic error message to the client
      return NextResponse.json(
        { error: 'Failed to connect bank account' },
        { status: backendResponse.status }
      );
    }
    
    const data = await backendResponse.json();
    console.log('Successful response from backend:', data);
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in connect-bank API route:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'An unknown error occurred' 
      },
      { status: 500 }
    );
  }
} 