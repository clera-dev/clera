import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Valid routing number for Alpaca sandbox
const VALID_TEST_ROUTING_NUMBER = "121000358";

export async function POST(request: NextRequest) {
  try {
    // Create supabase server client
    const supabase = await createClient();
    
    // Verify user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();
    
    if (!user) {
      console.error("Connect Bank API: User not authenticated");
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // --- PRODUCTION-READY ONBOARDING CHECK ---
    const { data: onboardingData, error: onboardingError } = await supabase
      .from('user_onboarding')
      .select('status')
      .eq('user_id', user.id)
      .single();

    if (onboardingError || !onboardingData) {
      console.error('API Onboarding Check: Error fetching status for user:', user.id, onboardingError);
      return NextResponse.json({ error: 'Could not verify onboarding status' }, { status: 500 });
    }

    const isOnboardingComplete = onboardingData.status === 'submitted' || onboardingData.status === 'approved';

    if (!isOnboardingComplete) {
      console.error(`API Onboarding Check: User ${user.id} has not completed onboarding. Status: ${onboardingData.status}`);
      return NextResponse.json(
        { error: 'Onboarding not completed' },
        { status: 401 }
      );
    }
    // --- END CHECK ---
    
    // Get request body
    const reqBody = await request.json();
    const {
      accountId,
      accountOwnerName,
      bankAccountType,
      bankAccountNumber,
      bankRoutingNumber,
    } = reqBody;
    
    // Validate routing number
    if (bankRoutingNumber !== VALID_TEST_ROUTING_NUMBER) {
      return NextResponse.json(
        { error: `Invalid routing number. For testing use ${VALID_TEST_ROUTING_NUMBER}` },
        { status: 400 }
      );
    }
    
    // Validate required fields
    const missingFields = [];
    if (!accountId) missingFields.push('accountId');
    if (!accountOwnerName) missingFields.push('accountOwnerName');
    if (!bankAccountType) missingFields.push('bankAccountType');
    if (!bankAccountNumber) missingFields.push('bankAccountNumber');
    if (!bankRoutingNumber) missingFields.push('bankRoutingNumber');
    
    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missingFields.join(', ')}` },
        { status: 400 }
      );
    }
    
    console.log("Connect Bank API: Connecting bank account for:", accountId);
    
    // Call the backend API to create the ACH relationship
    const apiUrl = process.env.BACKEND_API_URL;
    
    try {
      // First check if a relationship already exists
      const checkResponse = await fetch(`${apiUrl}/get-ach-relationships`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.BACKEND_API_KEY || '',
        },
        body: JSON.stringify({
          accountId
        }),
      });
      
      if (!checkResponse.ok) {
        console.warn(`Failed to check existing relationships: ${checkResponse.status}`);
      } else {
        const relationshipsData = await checkResponse.json();
        
        // If there's an existing relationship, delete it first
        if (relationshipsData.relationships && relationshipsData.relationships.length > 0) {
          const existingRelationship = relationshipsData.relationships[0];
          console.log(`Found existing relationship with ID: ${existingRelationship.id}. Attempting to delete it first.`);
          
          // =================================================================
          // CRITICAL SECURITY FIX: Verify ownership before deletion
          // =================================================================
          
          // Verify the user owns this ACH relationship before deleting
          const { data: existingBankConnection, error: ownershipError } = await supabase
            .from('user_bank_connections')
            .select('id, relationship_id, alpaca_account_id')
            .eq('user_id', user.id)
            .eq('relationship_id', existingRelationship.id)
            .eq('alpaca_account_id', accountId)
            .single();
          
          if (ownershipError || !existingBankConnection) {
            console.error(`Connect Bank API: User ${user.id} does not own ACH relationship ${existingRelationship.id} for account ${accountId}`);
            return NextResponse.json(
              { error: 'ACH relationship not found or access denied' },
              { status: 403 }
            );
          }
          
          console.log(`Connect Bank API: Ownership verified. User ${user.id} owns ACH relationship ${existingRelationship.id}`);
          
          // Delete from Supabase first (safer to delete local record before remote)
          try {
            const { error: supabaseDeleteError, count } = await supabase
              .from('user_bank_connections')
              .delete()
              .eq('relationship_id', existingRelationship.id)
              .eq('user_id', user.id)
              .eq('alpaca_account_id', accountId);
            
            if (supabaseDeleteError) {
              console.error(`Connect Bank API: Failed to delete bank connection from Supabase: ${supabaseDeleteError.message}`);
              return NextResponse.json(
                { error: 'Failed to delete local bank connection' },
                { status: 500 }
              );
            }
            
            if (count === 0) {
              console.error(`Connect Bank API: No rows deleted from Supabase for relationship ${existingRelationship.id}`);
              return NextResponse.json(
                { error: 'ACH relationship not found' },
                { status: 404 }
              );
            }
            
            console.log(`Connect Bank API: Successfully deleted bank connection from Supabase for relationship: ${existingRelationship.id}`);
            
          } catch (supabaseError) {
            console.error(`Connect Bank API: Exception deleting from Supabase: ${supabaseError}`);
            return NextResponse.json(
              { error: 'Failed to delete local bank connection' },
              { status: 500 }
            );
          }
          
          // Delete the existing relationship from Alpaca
          const deleteResponse = await fetch(`${apiUrl}/delete-ach-relationship`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': process.env.BACKEND_API_KEY || '',
            },
            body: JSON.stringify({
              accountId,
              achRelationshipId: existingRelationship.id
            }),
          });
          
          if (!deleteResponse.ok) {
            console.warn(`Failed to delete existing relationship from Alpaca: ${deleteResponse.status}`);
            if (deleteResponse.status !== 404) {
              // Only show warning for errors other than "not found"
              console.warn(`Error details: ${await deleteResponse.text()}`);
            }
            // Continue anyway, as we'll try to create the new one
          } else {
            console.log(`Successfully deleted existing relationship from Alpaca: ${existingRelationship.id}`);
          }
        }
      }
      
      // Now create the new relationship
      const response = await fetch(`${apiUrl}/create-ach-relationship-manual`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.BACKEND_API_KEY || '',
        },
        body: JSON.stringify({
          accountId,
          accountOwnerName,
          bankAccountType,
          bankAccountNumber,
          bankRoutingNumber,
        }),
      });
      
      const responseData = await response.json();
      
      // If we get an error about only one active relationship allowed, return the existing one
      if (!response.ok && responseData.detail && responseData.detail.includes("only one active ach relationship allowed")) {
        console.log("Only one active ACH relationship allowed, fetching the existing one");
        
        // Fetch the existing relationship
        const relationshipsResponse = await fetch(`${apiUrl}/get-ach-relationships`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': process.env.BACKEND_API_KEY || '',
          },
          body: JSON.stringify({
            accountId
          }),
        });
        
        if (!relationshipsResponse.ok) {
          throw new Error(`Failed to fetch existing relationships: ${relationshipsResponse.status}`);
        }
        
        const relationshipsData = await relationshipsResponse.json();
        
        if (relationshipsData.relationships && relationshipsData.relationships.length > 0) {
          const existingRelationship = relationshipsData.relationships[0];
          console.log(`Using existing relationship: ${existingRelationship.id}`);
          
          return NextResponse.json({
            id: existingRelationship.id,
            status: existingRelationship.status,
            message: "Using existing ACH relationship",
          });
        } else {
          // This shouldn't happen but just in case
          throw new Error("No active relationship found after error");
        }
      }
      
      // For non-200 responses, handle errors
      if (!response.ok) {
        // For other errors, throw them as usual
        const errorMessage = responseData.detail || responseData.error || JSON.stringify(responseData);
        throw new Error(errorMessage);
      }
      
      // If we got here, we successfully created a new relationship
      console.log("Connect Bank API: Successfully created ACH relationship:", responseData);
      
      // Store the bank details in Supabase
      try {
        const { error: supabaseError } = await supabase
          .from('user_bank_connections')
          .insert({
            user_id: user.id,
            alpaca_account_id: accountId,
            relationship_id: responseData.id,
            bank_name: "Bank Account",
            bank_account_type: bankAccountType,
            last_4: bankAccountNumber.slice(-4),
            created_at: new Date().toISOString()
          });
        
        if (supabaseError) {
          console.error("Connect Bank API: Error storing bank details in Supabase:", supabaseError);
        }
      } catch (e) {
        console.error("Connect Bank API: Exception storing bank details in Supabase:", e);
      }
      
      return NextResponse.json(responseData);
      
    } catch (error) {
      console.error('Connect Bank API: Error connecting bank account:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'An unknown error occurred' },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('Connect Bank API: Unexpected error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An unknown error occurred' },
      { status: 500 }
    );
  }
} 