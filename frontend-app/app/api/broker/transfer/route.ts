import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  try {
    // Create supabase server client
    const supabase = await createClient();
    
    // Verify user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();
    
    if (!user) {
      console.error("Transfer API: User not authenticated");
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Get request body
    const reqBody = await request.json();
    const {
      accountId,
      relationshipId,
      amount
    } = reqBody;
    
    console.log("Transfer API: Request received", { 
      userId: user.id, 
      accountId, 
      relationshipId,
      amount
    });
    
    // Validate required fields
    const missingFields = [];
    if (!accountId) missingFields.push('accountId');
    if (!relationshipId) missingFields.push('relationshipId');
    if (!amount) missingFields.push('amount');
    
    if (missingFields.length > 0) {
      console.error("Transfer API: Missing fields", missingFields);
      return NextResponse.json(
        { error: `Missing required fields: ${missingFields.join(', ')}` },
        { status: 400 }
      );
    }
    
    // Validate amount
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < 1) {
      console.error("Transfer API: Invalid amount", amount);
      return NextResponse.json(
        { error: 'Amount must be at least $1' },
        { status: 400 }
      );
    }
    
    // Call the backend API to initiate the transfer
    const apiUrl = process.env.BACKEND_API_URL || 'http://localhost:8000';
    console.log("Transfer API: Calling backend", `${apiUrl}/initiate-ach-transfer`);
    
    const response = await fetch(`${apiUrl}/initiate-ach-transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.BACKEND_API_KEY || '',
      },
      body: JSON.stringify({
        accountId,
        relationshipId,
        amount
      }),
    });
    
    const responseData = await response.json();
    
    if (!response.ok) {
      const errorMessage = responseData.detail || responseData.error || JSON.stringify(responseData);
      console.error("Transfer API: Backend error", errorMessage);
      throw new Error(errorMessage);
    }
    
    console.log("Transfer API: Backend response success", responseData);
    
    // Record the transfer in Supabase - WITHOUT direction field which is causing cache issues
    try {
      const { error: supabaseError } = await supabase
        .from('user_transfers')
        .insert({
          user_id: user.id,
          alpaca_account_id: accountId,
          relationship_id: relationshipId,
          transfer_id: responseData.id,
          amount: amount,
          status: responseData.status || 'SUBMITTED',
          created_at: new Date().toISOString()
        });
      
      if (supabaseError) {
        console.error("Transfer API: Supabase insert error", supabaseError);
      } else {
        console.log("Transfer API: Supabase insert success");
      }
    } catch (supabaseErr) {
      console.error("Transfer API: Supabase error", supabaseErr);
    }
    
    return NextResponse.json(responseData);
    
  } catch (error) {
    console.error('Transfer API: Unexpected error', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An unknown error occurred' },
      { status: 500 }
    );
  }
} 