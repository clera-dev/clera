import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server'; // Import server client

export async function GET() {
  const supabase = await createClient();

  // Get current user session
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error('Error fetching user or no user session:', userError);
    return NextResponse.json({ detail: 'Authentication required' }, { status: 401 });
  }

  // Fetch onboarding data for the user
  const { data: onboardingData, error: dbError } = await supabase
    .from('user_onboarding')
    .select('alpaca_account_id') // Select only the needed field
    .eq('user_id', user.id)
    .maybeSingle(); // Expect 0 or 1 row

  if (dbError) {
    console.error(`Error fetching onboarding data for user ${user.id}:`, dbError);
    return NextResponse.json({ detail: 'Failed to retrieve account information' }, { status: 500 });
  }

  if (!onboardingData || !onboardingData.alpaca_account_id) {
    console.warn(`No Alpaca account ID found for user ${user.id}`);
    // Return success, but indicate no account ID found
    return NextResponse.json({ accountId: null, detail: 'Alpaca account not found or setup incomplete.' }, { status: 200 });
  }

  // Return the Alpaca Account ID
  return NextResponse.json({ accountId: onboardingData.alpaca_account_id }, { status: 200 });
} 