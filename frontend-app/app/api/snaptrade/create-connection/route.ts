import { NextResponse } from 'next/server';
import { createClient as createServerSupabase } from '@/utils/supabase/server';

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get the session for JWT token
    const { data: { session } } = await supabase.auth.getSession();
    
    // Get request body
    const body = await request.json();
    const { 
      // ARCHITECTURE: Default to undefined to show ALL brokerages
      // Only pass connectionType if explicitly specified for filtering
      connectionType, 
      broker, 
      redirectUrl 
    } = body;
    
    // Validate redirect URL
    const finalRedirectUrl = redirectUrl || `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/onboarding/snaptrade-callback`;
    
    // Call backend to get SnapTrade connection URL
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
    const response = await fetch(`${backendUrl}/api/snaptrade/connection-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // PRODUCTION-GRADE: Pass JWT token for authentication
        'Authorization': `Bearer ${session?.access_token || ''}`,
        // Also pass API key as fallback
        'X-API-Key': process.env.BACKEND_API_KEY || '',
      },
      body: JSON.stringify({
        user_id: user.id,
        // Only include connection_type if explicitly provided, otherwise omit to show all brokerages
        ...(connectionType && { connection_type: connectionType }),
        broker: broker || null,
        redirect_url: finalRedirectUrl,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Backend error:', errorText);
      throw new Error('Failed to create SnapTrade connection URL');
    }
    
    const data = await response.json();
    
    if (!data.success || !data.connection_url) {
      throw new Error('Invalid response from backend');
    }
    
    return NextResponse.json({
      success: true,
      connectionUrl: data.connection_url,
      userId: user.id,
    });
    
  } catch (error) {
    console.error('Error creating SnapTrade connection:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to create connection URL',
        success: false
      },
      { status: 500 }
    );
  }
}

