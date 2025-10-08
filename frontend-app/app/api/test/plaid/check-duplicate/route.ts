import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * Check for duplicate Plaid items before exchanging public token
 * 
 * Per Plaid best practices: https://plaid.com/docs/link/duplicate-items/
 * - Prevents double billing
 * - Prevents confusing UX (multiple copies of same account)
 * - Prevents fraud/abuse attempts
 */
export async function POST(request: Request) {
  try {
    // Authenticate user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const { institution_id, accounts } = await request.json();

    if (!institution_id || !accounts || accounts.length === 0) {
      return NextResponse.json(
        { isDuplicate: false },
        { status: 200 }
      );
    }

    console.log('🔍 Checking for duplicate Plaid connection:', {
      userId: user.id,
      institutionId: institution_id,
      accountCount: accounts.length,
    });

    // Query user_investment_accounts for existing connections
    // Check by institution_id and account masks
    const { data: existingAccounts, error } = await supabase
      .from('user_investment_accounts')
      .select('id, institution_id, institution_name, account_name, raw_account_data')
      .eq('user_id', user.id)
      .eq('provider', 'plaid')
      .eq('institution_id', institution_id)
      .eq('is_active', true);

    if (error) {
      console.error('Error querying existing accounts:', error);
      // Fail open - allow connection on error
      return NextResponse.json({ isDuplicate: false });
    }

    // If no existing accounts from this institution, definitely not a duplicate
    if (!existingAccounts || existingAccounts.length === 0) {
      console.log('✅ No existing accounts from this institution');
      return NextResponse.json({ isDuplicate: false });
    }

    // Check if ANY of the new accounts match existing accounts
    // Match by: account name + mask (per Plaid recommendations)
    const matchedAccounts: any[] = [];

    for (const newAccount of accounts) {
      for (const existingAccount of existingAccounts) {
        const existingRawData = existingAccount.raw_account_data;
        
        if (existingRawData) {
          const existingMask = existingRawData.mask;
          const existingName = existingRawData.name || existingAccount.account_name;
          const existingSubtype = existingRawData.subtype;

          // Match criteria: same mask + same name (case insensitive)
          const maskMatch = existingMask === newAccount.mask;
          const nameMatch = existingName?.toLowerCase() === newAccount.name?.toLowerCase();
          const subtypeMatch = existingSubtype === newAccount.subtype;

          if (maskMatch && nameMatch && subtypeMatch) {
            matchedAccounts.push({
              existing: {
                id: existingAccount.id,
                name: existingName,
                mask: existingMask,
                subtype: existingSubtype,
              },
              new: newAccount,
            });
          }
        }
      }
    }

    const isDuplicate = matchedAccounts.length > 0;

    if (isDuplicate) {
      console.log('⚠️ Duplicate items detected:', {
        matchCount: matchedAccounts.length,
        matched: matchedAccounts,
      });
    } else {
      console.log('✅ No duplicate accounts found');
    }

    return NextResponse.json({
      isDuplicate,
      matchedAccounts,
      institution: {
        id: institution_id,
        name: existingAccounts[0]?.institution_name,
      },
    });

  } catch (error) {
    console.error('Error in duplicate check:', error);
    // Fail open - allow connection on error
    return NextResponse.json({ isDuplicate: false });
  }
}

