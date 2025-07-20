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
    const fullBackendUrl = `${backendUrl}/api/account/${accountId}/pii/updateable-fields`;
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
    console.error('Updateable Fields API: Error fetching updateable fields:', error);
    
    const { error: errorMessage, status } = handleAuthError(error);
    return NextResponse.json({ error: errorMessage }, { status });
  }
} 