import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
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
    
    // Get query parameters
    const url = new URL(request.url);
    const accountId = url.searchParams.get('accountId');
    
    if (!accountId) {
      return NextResponse.json(
        { error: 'Account ID is required' },
        { status: 400 }
      );
    }
    
    console.log(`Checking bank status for account: ${accountId}`);
    
    // Call the backend to get ACH relationships
    const backendUrl = `${process.env.BACKEND_API_URL}/get-ach-relationships`;
    const backendResponse = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.BACKEND_API_KEY || ''
      },
      body: JSON.stringify({
        accountId: accountId
      })
    });
    
    if (!backendResponse.ok) {
      console.warn(`Bank status check failed with status: ${backendResponse.status}`);
      let errorDetail = 'Failed to get bank relationships';
      
      try {
        const errorText = await backendResponse.text();
        console.warn(`Bank status error response: ${errorText}`);
      } catch (e) {
        // Ignore errors when reading the error response
      }
      
      // Just return empty relationships list if there's an error
      // This is a polling endpoint, so we want to be resilient
      return NextResponse.json({
        relationships: []
      });
    }
    
    const data = await backendResponse.json();
    
    // Log the response for debugging
    if (data.relationships && data.relationships.length > 0) {
      console.log(`Found ${data.relationships.length} ACH relationship(s) for account ${accountId}`);
      console.log(`First relationship status: ${data.relationships[0].status}`);
    } else {
      console.log(`No ACH relationships found for account ${accountId}`);
    }
    
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('Error in bank status API route:', error);
    
    // Since this is a polling endpoint, return empty relationships
    // instead of an error to avoid breaking the UI
    return NextResponse.json({
      relationships: []
    });
  }
} 