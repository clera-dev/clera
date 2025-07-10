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
    
    console.log("Delete ACH API: Validating ownership for ACH relationship:", achRelationshipId, "account:", accountId, "user:", user.id);
    
    // =================================================================
    // CRITICAL SECURITY FIX: Verify ownership before any deletion
    // =================================================================
    
    // 1. Verify the user owns the Alpaca account
    const { data: onboardingData, error: onboardingError } = await supabase
      .from('user_onboarding')
      .select('alpaca_account_id')
      .eq('user_id', user.id)
      .eq('alpaca_account_id', accountId)
      .single();
    
    if (onboardingError || !onboardingData) {
      console.error(`Delete ACH API: User ${user.id} does not own account ${accountId}`);
      return NextResponse.json(
        { error: 'Account not found or access denied' },
        { status: 403 }
      );
    }
    
    // 2. Verify the user owns the ACH relationship
    const { data: bankConnection, error: bankError } = await supabase
      .from('user_bank_connections')
      .select('id, relationship_id, alpaca_account_id')
      .eq('user_id', user.id)
      .eq('relationship_id', achRelationshipId)
      .eq('alpaca_account_id', accountId)
      .single();
    
    if (bankError || !bankConnection) {
      console.error(`Delete ACH API: User ${user.id} does not own ACH relationship ${achRelationshipId} for account ${accountId}`);
      return NextResponse.json(
        { error: 'ACH relationship not found or access denied' },
        { status: 403 }
      );
    }
    
    console.log(`Delete ACH API: Ownership verified. User ${user.id} owns account ${accountId} and ACH relationship ${achRelationshipId}`);
    
    // Call the backend API to delete the ACH relationship
    const apiUrl = process.env.BACKEND_API_URL;
    
    try {
      // =================================================================
      // FIXED: Delete from Alpaca FIRST to maintain transactional integrity
      // =================================================================
      
      console.log(`Delete ACH API: Deleting ACH relationship from Alpaca: ${achRelationshipId}`);
      
      // Delete from Alpaca FIRST (maintains transactional integrity)
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
        console.error(`Delete ACH API: Alpaca deletion failed: ${errorMessage}`);
        return NextResponse.json(
          { error: `Failed to delete ACH relationship from Alpaca: ${errorMessage}` },
          { status: response.status }
        );
      }
      
      console.log(`Delete ACH API: Successfully deleted ACH relationship from Alpaca: ${achRelationshipId}`);
      
      // =================================================================
      // Only delete from Supabase AFTER Alpaca deletion succeeds
      // =================================================================
      
      console.log(`Delete ACH API: Deleting local reference from Supabase: ${achRelationshipId}`);
      
      try {
        const { error: supabaseDeleteError, count } = await supabase
          .from('user_bank_connections')
          .delete()
          .eq('relationship_id', achRelationshipId)
          .eq('user_id', user.id)
          .eq('alpaca_account_id', accountId); // Extra security check
        
        if (supabaseDeleteError) {
          console.error(`Delete ACH API: Failed to delete bank connection from Supabase: ${supabaseDeleteError.message}`);
          // Note: Alpaca deletion succeeded but local cleanup failed
          // This is less critical than the reverse scenario
          return NextResponse.json(
            { 
              success: true,
              warning: 'ACH relationship deleted from Alpaca but local cleanup failed',
              error: 'Failed to delete local bank connection reference'
            },
            { status: 207 } // 207 Multi-Status: partial success
          );
        }
        
        if (count === 0) {
          console.warn(`Delete ACH API: No rows deleted from Supabase for relationship ${achRelationshipId} (may have been already deleted)`);
          // Alpaca deletion succeeded, so we return success even if local record was already gone
          return NextResponse.json({
            success: true,
            message: 'ACH relationship deleted from Alpaca',
            warning: 'Local reference was already removed'
          });
        }
        
        console.log(`Delete ACH API: Successfully deleted bank connection from Supabase for relationship: ${achRelationshipId}`);
        
      } catch (supabaseError) {
        console.error(`Delete ACH API: Exception deleting from Supabase: ${supabaseError}`);
        // Alpaca deletion succeeded but local cleanup failed
        return NextResponse.json(
          { 
            success: true,
            warning: 'ACH relationship deleted from Alpaca but local cleanup failed',
            error: 'Failed to delete local bank connection reference'
          },
          { status: 207 } // 207 Multi-Status: partial success
        );
      }
      
      // Both operations succeeded
      console.log("Delete ACH API: Successfully deleted ACH relationship from both Alpaca and Supabase");
      return NextResponse.json({
        success: true,
        message: 'ACH relationship deleted successfully',
        data: responseData
      });
      
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