import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.error("Delete ACH API: User not authenticated");
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Get request body
    const reqBody = await request.json();
    const { accountId, achRelationshipId } = reqBody;
    
    // Validate required fields
    if (!accountId || !achRelationshipId) {
      return NextResponse.json(
        { error: 'Missing required fields: accountId and achRelationshipId' },
        { status: 400 }
      );
    }
    
    console.log("Delete ACH API: Deleting ACH relationship:", achRelationshipId, "for account:", accountId);
    
    // Call the backend API to delete the ACH relationship
    const apiUrl = process.env.BACKEND_API_URL;
    
    try {
      // Delete from Supabase first (safer to delete local record before remote)
      try {
        const { error: supabaseDeleteError } = await supabase
          .from('user_bank_connections')
          .delete()
          .eq('relationship_id', achRelationshipId)
          .eq('user_id', user.id); // Extra security check
        
        if (supabaseDeleteError) {
          console.warn(`Warning: Failed to delete bank connection from Supabase: ${supabaseDeleteError.message}`);
        } else {
          console.log(`Successfully deleted bank connection from Supabase for relationship: ${achRelationshipId}`);
        }
      } catch (supabaseError) {
        console.warn(`Warning: Exception deleting from Supabase: ${supabaseError}`);
      }
      
      // Delete from Alpaca
      const response = await fetch(`${apiUrl}/delete-ach-relationship`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.BACKEND_API_KEY || '',
        },
        body: JSON.stringify({
          accountId,
          achRelationshipId,
        }),
      });
      
      const responseData = await response.json();
      
      if (!response.ok) {
        const errorMessage = responseData.detail || responseData.error || JSON.stringify(responseData);
        throw new Error(errorMessage);
      }
      
      console.log("Delete ACH API: Successfully deleted ACH relationship:", responseData);
      return NextResponse.json(responseData);
      
    } catch (error) {
      console.error('Delete ACH API: Error deleting ACH relationship:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'An unknown error occurred' },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('Delete ACH API: Unexpected error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An unknown error occurred' },
      { status: 500 }
    );
  }
} 