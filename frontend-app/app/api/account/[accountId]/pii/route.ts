import { NextRequest, NextResponse } from 'next/server';
import { 
  authenticateAndAuthorize, 
  createBackendHeaders, 
  handleAuthError 
} from '@/utils/api/auth-helpers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    const { accountId, backendUrl, apiKey } = await authenticateAndAuthorize(request, params);
    
    // Call the backend API
    const fullBackendUrl = `${backendUrl}/api/account/${accountId}/pii`;
    const headers = createBackendHeaders(apiKey);
    
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
    
    const { error: errorMessage, status } = handleAuthError(error);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    const { accountId, backendUrl, apiKey } = await authenticateAndAuthorize(request, params);
    
    // Get the request body
    const updateData = await request.json();

    // Call the backend API
    const fullBackendUrl = `${backendUrl}/api/account/${accountId}/pii`;
    const headers = createBackendHeaders(apiKey);
    
    const response = await fetch(fullBackendUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(updateData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      // Log the detailed error for debugging (server-side only)
      console.error('Backend API error details:', {
        status: response.status,
        errorText: errorText
      });
      
      // Return a generic error message to the client
      return NextResponse.json(
        { error: 'Failed to update account information' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('PII Update API: Error updating PII:', error);
    
    const { error: errorMessage, status } = handleAuthError(error);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}

// Keep PUT for backward compatibility but it will use PATCH internally
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  return PATCH(request, { params });
} 