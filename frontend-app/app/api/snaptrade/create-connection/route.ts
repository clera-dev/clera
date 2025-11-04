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
    
    // Get request body
    const body = await request.json();
    const { 
      connectionType = 'trade', 
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
        // Pass through any auth headers if needed
      },
      body: JSON.stringify({
        user_id: user.id,
        connection_type: connectionType,
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

