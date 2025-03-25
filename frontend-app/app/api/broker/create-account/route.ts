import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: Request) {
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
    
    // Parse the request body
    const alpacaRequestData = await request.json();
    
    // Validate required fields in the request
    if (!alpacaRequestData || 
        !alpacaRequestData.contact || 
        !alpacaRequestData.identity || 
        !alpacaRequestData.disclosures || 
        !alpacaRequestData.agreements ||
        alpacaRequestData.agreements.length === 0) {
      console.error('Invalid request data:', alpacaRequestData);
      return NextResponse.json(
        { error: 'Invalid request: Missing required fields' },
        { status: 400 }
      );
    }
    
    // Additional validation for required fields
    const { contact, identity, disclosures } = alpacaRequestData;
    
    // Check contact information
    if (!contact.email_address || !contact.phone_number || 
        !contact.street_address || contact.street_address.length === 0 ||
        !contact.city || !contact.state || !contact.postal_code || !contact.country) {
      console.error('Missing required contact fields');
      return NextResponse.json(
        { error: 'Invalid request: Missing required contact information' },
        { status: 400 }
      );
    }
    
    // Check identity information
    if (!identity.given_name || !identity.family_name || 
        !identity.date_of_birth || !identity.tax_id || 
        !identity.tax_id_type || !identity.country_of_citizenship ||
        !identity.country_of_birth || !identity.country_of_tax_residence ||
        !identity.funding_source || identity.funding_source.length === 0) {
      console.error('Missing required identity fields');
      return NextResponse.json(
        { error: 'Invalid request: Missing required identity information' },
        { status: 400 }
      );
    }
    
    // Check required agreements (customer and account)
    const hasCustomerAgreement = alpacaRequestData.agreements.some(
      (a: { agreement: string }) => a.agreement === 'customer_agreement'
    );
    const hasAccountAgreement = alpacaRequestData.agreements.some(
      (a: { agreement: string }) => a.agreement === 'account_agreement'
    );
    
    if (!hasCustomerAgreement || !hasAccountAgreement) {
      console.error('Missing required agreements');
      return NextResponse.json(
        { error: 'Invalid request: Customer and Account agreements are required' },
        { status: 400 }
      );
    }
    
    // Log information for debugging
    console.log('Backend API URL:', process.env.BACKEND_API_URL);
    console.log('Backend API Key exists:', !!process.env.BACKEND_API_KEY);
    
    // Call the backend API to create an Alpaca account
    const backendUrl = `${process.env.BACKEND_API_URL}/create-alpaca-account`;
    console.log('Calling backend URL:', backendUrl);
    
    const backendResponse = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.BACKEND_API_KEY || ''
      },
      body: JSON.stringify({
        userId: user.id,
        alpacaData: alpacaRequestData
      })
    });
    
    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      let errorDetail;
      try {
        const errorData = JSON.parse(errorText);
        
        // Special handling for 409 Conflict (email already exists)
        if (backendResponse.status === 409 && errorData.detail && errorData.detail.code === "EMAIL_EXISTS") {
          return NextResponse.json(
            { 
              error: errorData.detail.message,
              code: errorData.detail.code,
              accountExists: true
            },
            { status: 409 }
          );
        }
        
        errorDetail = errorData.detail || 'Failed to create Alpaca account';
      } catch (parseError) {
        console.error('Error parsing error response:', parseError);
        errorDetail = `Failed to create Alpaca account: ${errorText}`;
      }
      
      console.error('Backend API Error:', errorDetail);
      console.error('Status:', backendResponse.status);
      
      throw new Error(errorDetail);
    }
    
    const data = await backendResponse.json();
    console.log('Successful response from backend:', data);
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in create-account API route:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'An unknown error occurred' 
      },
      { status: 500 }
    );
  }
}