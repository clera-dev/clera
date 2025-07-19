import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    const { accountId } = await params;
    
    // Try different ways to access environment variables
    const backendUrl = process.env.BACKEND_API_URL || 'http://localhost:8000';
    const apiKey = process.env.BACKEND_API_KEY || '';
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Server configuration error: API key not available' },
        { status: 500 }
      );
    }
    
    // Create supabase server client
    const supabase = await createClient();
    
    // Verify user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify user owns this account
    const { data: onboardingData, error: onboardingError } = await supabase
      .from('user_onboarding')
      .select('alpaca_account_id')
      .eq('user_id', user.id)
      .single();

    if (onboardingError || !onboardingData?.alpaca_account_id) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    if (onboardingData.alpaca_account_id !== accountId) {
      return NextResponse.json({ error: 'Unauthorized access to account' }, { status: 403 });
    }

    // Call the backend API
    const fullBackendUrl = `${backendUrl}/api/account/${accountId}/pii`;
    
    const headers = {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey
    };
    
    const response = await fetch(fullBackendUrl, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend API error: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('PII API: Error fetching PII:', error);
    return NextResponse.json(
      { error: 'Failed to fetch account information' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    const { accountId } = await params;
    
    // Try different ways to access environment variables
    const backendUrl = process.env.BACKEND_API_URL || 'http://localhost:8000';
    const apiKey = process.env.BACKEND_API_KEY || '';
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Server configuration error: API key not available' },
        { status: 500 }
      );
    }
    
    // Create supabase server client
    const supabase = await createClient();
    
    // Verify user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify user owns this account
    const { data: onboardingData, error: onboardingError } = await supabase
      .from('user_onboarding')
      .select('alpaca_account_id')
      .eq('user_id', user.id)
      .single();

    if (onboardingError || !onboardingData?.alpaca_account_id) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    if (onboardingData.alpaca_account_id !== accountId) {
      return NextResponse.json({ error: 'Unauthorized access to account' }, { status: 403 });
    }

    // Get the request body
    const updateData = await request.json();

    // Call the backend API
    const fullBackendUrl = `${backendUrl}/api/account/${accountId}/pii`;
    
    const headers = {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey
    };
    
    const response = await fetch(fullBackendUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(updateData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      // Try to parse error response
      try {
        const errorData = JSON.parse(errorText);
        return NextResponse.json(errorData, { status: response.status });
      } catch {
        return NextResponse.json(
          { error: `Backend API error: ${response.status}` },
          { status: response.status }
        );
      }
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('PII Update API: Error updating PII:', error);
    return NextResponse.json(
      { error: 'Failed to update account information' },
      { status: 500 }
    );
  }
}

// Keep PUT for backward compatibility but it will use PATCH internally
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  return PATCH(request, { params });
} 