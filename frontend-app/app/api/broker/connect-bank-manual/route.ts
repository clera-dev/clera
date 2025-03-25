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
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Get request body
    const reqBody = await request.json();
    const {
      accountId,
      accountOwnerName,
      bankAccountType,
      bankAccountNumber,
      bankRoutingNumber
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
    
    // First check if the user already has an ACH relationship
    const apiUrl = process.env.BACKEND_API_URL || 'http://localhost:8000';
    
    const existingResponse = await fetch(`${apiUrl}/get-ach-relationships/${accountId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.BACKEND_API_KEY || '',
      },
    });
    
    if (existingResponse.ok) {
      const existingData = await existingResponse.json();
      
      // If they have an active relationship, use that instead of creating a new one
      if (existingData.relationships && existingData.relationships.length > 0) {
        const activeRelationship = existingData.relationships.find(
          (rel: any) => rel.status === 'APPROVED' || rel.status === 'ACTIVE'
        );
        
        if (activeRelationship) {
          // Store the relationship in Supabase
          await supabase
            .from('user_bank_connections')
            .upsert({
              user_id: user.id,
              alpaca_account_id: accountId,
              relationship_id: activeRelationship.id,
              bank_name: 'Manual Entry',
              bank_account_type: bankAccountType,
              last_4: bankAccountNumber.slice(-4),
              created_at: new Date().toISOString(),
            });
          
          return NextResponse.json({
            id: activeRelationship.id,
            status: activeRelationship.status,
            message: "Using existing ACH relationship"
          });
        }
      }
    }
    
    // If no existing active relationship, create a new one
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
        bankRoutingNumber
      }),
    });
    
    const responseData = await response.json();
    
    // Check for the specific "only one active ach relationship allowed" error
    if (!response.ok) {
      if (responseData.code === 40910000) {
        // Get existing relationships and use the active one
        const relationshipsResponse = await fetch(`${apiUrl}/get-ach-relationships/${accountId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': process.env.BACKEND_API_KEY || '',
          },
        });
        
        if (relationshipsResponse.ok) {
          const relationshipsData = await relationshipsResponse.json();
          
          if (relationshipsData.relationships && relationshipsData.relationships.length > 0) {
            const activeRelationship = relationshipsData.relationships.find(
              (rel: any) => rel.status === 'APPROVED' || rel.status === 'ACTIVE'
            );
            
            if (activeRelationship) {
              // Store the relationship in Supabase
              await supabase
                .from('user_bank_connections')
                .upsert({
                  user_id: user.id,
                  alpaca_account_id: accountId,
                  relationship_id: activeRelationship.id,
                  bank_name: 'Manual Entry',
                  bank_account_type: bankAccountType,
                  last_4: bankAccountNumber.slice(-4),
                  created_at: new Date().toISOString(),
                });
              
              return NextResponse.json({
                id: activeRelationship.id,
                status: activeRelationship.status,
                message: "Using existing ACH relationship"
              });
            }
          }
        }
        
        // If we can't find an active relationship, return a clear error
        return NextResponse.json(
          { 
            error: "You already have an active bank account connected. Please use that account or contact support for assistance." 
          },
          { status: 400 }
        );
      }
      
      // For other errors, throw them as usual
      const errorMessage = responseData.detail || responseData.error || JSON.stringify(responseData);
      throw new Error(errorMessage);
    }
    
    // If we got here, we successfully created a new relationship
    // Store the relationship in Supabase for tracking
    await supabase
      .from('user_bank_connections')
      .upsert({
        user_id: user.id,
        alpaca_account_id: accountId,
        relationship_id: responseData.id,
        bank_name: 'Manual Entry',
        bank_account_type: bankAccountType,
        last_4: bankAccountNumber.slice(-4),
        created_at: new Date().toISOString(),
      });
    
    return NextResponse.json(responseData);
    
  } catch (error) {
    console.error('Error connecting bank:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An unknown error occurred' },
      { status: 500 }
    );
  }
} 