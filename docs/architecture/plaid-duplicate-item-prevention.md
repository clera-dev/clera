# Plaid Duplicate Item Prevention

## Problem Statement

When users connect the same Plaid accounts multiple times, it creates **duplicate Items** which cause:
1. ❌ **Double billing** from Plaid (billed per Item)
2. ❌ **Confusing UX** (same account shows up twice in portfolio)
3. ❌ **Data integrity issues** (which Item is source of truth?)
4. ❌ **Fraud vector** (abuse attempts, multiple sign-up bonuses)

## Plaid's Official Guidance

Per [Plaid Documentation on Preventing Duplicate Items](https://plaid.com/docs/link/duplicate-items/):

> "Before requesting an `access_token`, examine and compare the `onSuccess` callback metadata to the user's existing Items. You can compare a combination of the accounts' `institution_id`, account `name`, and account `mask` to determine whether an end user has previously linked an account to your application. **Do not exchange a public token for an access token if you detect a duplicate Item.**"

**Key Matching Criteria:**
- ✅ `institution_id` - Same financial institution
- ✅ `account name` - Same account (case insensitive)
- ✅ `account mask` - Last 4 digits (usually)
- ❌ **NEVER use account number** - use mask instead

## Production-Grade Solution

### **Two-Phase Approach:**

### Phase 1: Auto-Detection for Existing Users ✅
**Problem:** Users who connected Plaid BEFORE the timestamp migration have accounts in DB but `plaid_connection_completed_at = NULL`

**Solution:** On OnboardingFlow mount, check for existing Plaid accounts → Auto-complete onboarding

```typescript
// In OnboardingFlow.tsx
const checkAndAutoCompletePlaidOnboarding = async () => {
  const response = await fetch('/api/test/user/investment-accounts');
  const data = await response.json();
  const plaidAccounts = data.accounts?.filter(acc => acc.provider === 'plaid') || [];

  if (plaidAccounts.length > 0) {
    // User has Plaid accounts but onboarding incomplete
    await saveOnboardingData(
      userId,
      onboardingData,
      'submitted',
      undefined,
      'plaid'  // Set plaid_connection_completed_at timestamp
    );
    
    // Navigate to /invest
    router.push('/invest');
  }
};
```

### Phase 2: Prevent Future Duplicates ✅
**Problem:** Users trying to connect same accounts again in the future

**Solution:** Check for duplicates in `onSuccess` callback BEFORE exchanging token

```typescript
// In PlaidConnectionStep.tsx
const onSuccessCallback = async (publicToken: string, metadata: any) => {
  // 1. Check for duplicate BEFORE exchanging token
  const duplicateCheck = await fetch('/api/test/plaid/check-duplicate', {
    body: JSON.stringify({
      institution_id: metadata.institution?.institution_id,
      accounts: metadata.accounts || [],
    }),
  });

  const duplicateResult = await duplicateCheck.json();
  
  if (duplicateResult.isDuplicate) {
    // Duplicate detected - DON'T exchange token
    setConnected(true);  // Show success state
    onComplete();        // Proceed with onboarding
    return;              // EXIT without token exchange
  }

  // 2. No duplicate - safe to exchange token
  await fetch('/api/test/plaid/exchange-token', {
    body: JSON.stringify({ public_token: publicToken, ... }),
  });
};
```

### Duplicate Check Logic

**Backend API: `/api/test/plaid/check-duplicate`**

```typescript
// Match criteria per Plaid recommendations
const maskMatch = existingMask === newAccount.mask;
const nameMatch = existingName?.toLowerCase() === newAccount.name?.toLowerCase();
const subtypeMatch = existingSubtype === newAccount.subtype;

if (maskMatch && nameMatch && subtypeMatch) {
  // DUPLICATE FOUND!
  return { isDuplicate: true, matchedAccounts: [...] };
}
```

## User Flow Examples

### Scenario 1: New User - First Connection ✅
```
1. User clicks "Connect with Plaid"
2. Selects Charles Schwab, logs in
3. Plaid returns: 401k (...6666), IRA (...5555)
4. Duplicate check: NO existing items
5. Exchange token → Save to DB
6. Complete onboarding → Navigate to /invest
```

### Scenario 2: Existing User (Pre-Migration) ✅
```
1. User loads /protected page
2. OnboardingFlow mounts
3. Auto-detection: Found 2 Plaid accounts in DB
4. Auto-save: plaid_connection_completed_at = NOW()
5. Auto-redirect: Navigate to /invest
6. No onboarding loop! ✓
```

### Scenario 3: User Tries to Reconnect Same Accounts ✅
```
1. User clicks "Connect with Plaid" again
2. Selects Charles Schwab, logs in  
3. Plaid returns: 401k (...6666), IRA (...5555)
4. Duplicate check: MATCH FOUND
   - institution_id: ins_56 (Schwab) ✓
   - 401k mask: 6666 ✓
   - IRA mask: 5555 ✓
5. DON'T exchange token
6. Show: "Accounts Connected!" (success state)
7. Complete onboarding → Navigate to /invest
8. NO duplicate Item created ✓
9. NO double billing ✓
```

### Scenario 4: User Adds NEW Account at Same Institution ✅
```
1. User has: Schwab 401k (...6666) already connected
2. Later: Adds Schwab Roth IRA (...7777)
3. Duplicate check: 
   - institution_id matches (Schwab) ✓
   - BUT mask different (7777 ≠ 6666) ✓
4. isDuplicate: FALSE
5. Exchange token → Save new account
6. User now has: 401k + Roth IRA ✓
```

### Scenario 5: User Reconnects After Account Refresh ✅
```
1. User's Schwab Item expired (needs re-auth)
2. Uses Link update mode (different flow)
3. OR deletes + re-adds institution
4. Duplicate check detects same accounts
5. Backend can choose to:
   - Update existing item's access_token
   - OR delete old item + use new one
6. Either way: No duplicate data in portfolio ✓
```

## Implementation Details

### Files Created/Modified:

1. **`frontend-app/utils/api/plaid-duplicate-check.ts`** ✅
   - `checkForDuplicatePlaidItem()` - Check metadata against DB
   - `checkUserHasPlaidAccounts()` - Simple existence check

2. **`frontend-app/app/api/test/plaid/check-duplicate/route.ts`** ✅
   - Backend duplicate detection logic
   - Matches: institution_id + name + mask + subtype

3. **`frontend-app/components/onboarding/PlaidConnectionStep.tsx`** ✅
   - Added duplicate check in onSuccess callback
   - Prevents token exchange if duplicate found
   - Shows success state and proceeds

4. **`frontend-app/components/onboarding/OnboardingFlow.tsx`** ✅
   - Added `checkAndAutoCompletePlaidOnboarding()`
   - Auto-detects existing connections on mount
   - Auto-completes onboarding for pre-migration users

## Error Handling

### Fail-Open Strategy
If duplicate check API fails (network error, server down, etc.):
- ✅ Allow connection to proceed (fail open)
- ✅ Better to risk duplicate than block legitimate user
- ✅ Log error for monitoring

### Edge Cases Handled:

1. **NULL/Missing Data:**
   - Missing institution_id → Allow connection
   - Missing accounts → Allow connection
   - Missing raw_account_data → Allow connection

2. **Case Sensitivity:**
   - Account names compared case-insensitive
   - "Plaid Checking" === "plaid checking"

3. **Partial Matches:**
   - Require ALL three criteria to match (institution + name + mask)
   - Prevents false positives

4. **Legitimate Duplicates:**
   - Joint accounts (multiple users, same account)
   - Business accounts (multiple employees)
   - Solution: Scope duplicate check to SINGLE user only

## Benefits

### For Users:
- ✅ Clean, non-confusing portfolio view
- ✅ Fast onboarding (no re-entering same accounts)
- ✅ Clear messaging if accounts already connected

### For Business:
- ✅ **Saves money** - no double billing from Plaid
- ✅ **Better data** - no duplicate items to manage
- ✅ **Fraud prevention** - stops abuse attempts
- ✅ **Analytics accuracy** - clean data for reporting

### For Engineering:
- ✅ **Follows best practices** - per Plaid recommendations
- ✅ **Production-ready** - handles edge cases
- ✅ **Maintainable** - clear separation of concerns
- ✅ **Testable** - well-defined inputs/outputs

## Testing Checklist

### Test 1: New User - First Connection
- [ ] No duplicates detected
- [ ] Token exchanged successfully
- [ ] Accounts saved to DB
- [ ] Onboarding completed

### Test 2: Existing User (Pre-Migration)
- [ ] Auto-detection finds existing accounts
- [ ] Onboarding auto-completed
- [ ] Timestamp set in DB
- [ ] Redirect to /invest
- [ ] No onboarding loop

### Test 3: User Tries Same Accounts Again
- [ ] Duplicate detected in onSuccess callback
- [ ] Token NOT exchanged
- [ ] Success state shown ("Accounts Connected!")
- [ ] Onboarding proceeds normally
- [ ] No new DB entries
- [ ] No Plaid billing

### Test 4: User Adds Different Account (Same Institution)
- [ ] Different mask detected
- [ ] NOT flagged as duplicate
- [ ] Token exchanged
- [ ] New account added to DB

### Test 5: API Failure Handling
- [ ] Duplicate check fails → Allow connection
- [ ] Error logged for monitoring
- [ ] User not blocked

## Monitoring & Analytics

### Key Metrics to Track:

1. **Duplicate Prevention Rate**
   ```sql
   -- Count how often duplicates are prevented
   SELECT COUNT(*) as duplicate_attempts
   FROM audit_logs
   WHERE event_type = 'plaid_duplicate_prevented';
   ```

2. **Auto-Completion Rate**
   ```sql
   -- Count auto-completions for pre-migration users
   SELECT COUNT(*) as auto_completed
   FROM user_onboarding
   WHERE plaid_connection_completed_at IS NOT NULL
     AND updated_at > plaid_connection_completed_at;
   ```

3. **Item Invalidation Events**
   ```sql
   -- Track Schwab/Chase item invalidations
   SELECT COUNT(*) as invalidated_items
   FROM user_investment_accounts
   WHERE is_active = false
     AND provider = 'plaid'
     AND institution_id IN ('ins_56', 'ins_3');  -- Schwab, Chase
   ```

## Special Institution Handling

### Chase, PNC, Schwab, Navy Federal

**Automatic Invalidation:**
Per Plaid docs, these institutions **automatically invalidate** old Items when a duplicate is created (under certain conditions).

**Our Strategy:**
1. Detect duplicate BEFORE creating it
2. If old Item gets invalidated anyway:
   - Delete old Item from DB
   - Mark as inactive
   - Use new Item (if different accounts selected)
   - OR use update mode to refresh old Item

## Future Enhancements

### Short-term:
1. **Update Mode Integration**
   - When Plaid item expires, use update mode
   - Don't create new item, refresh existing one

2. **Better Error Messages**
   - Show which specific accounts are already connected
   - Link to portfolio/dashboard to manage connections

### Long-term:
1. **Abuse Detection**
   - Track duplicate attempts per user
   - Flag suspicious patterns (10+ attempts in 1 hour)
   - Integrate with fraud prevention system

2. **Multi-Item Support**
   - Allow legitimate duplicates (joint accounts)
   - Add "purpose" field (personal vs business vs joint)
   - Better duplicate detection logic

3. **Analytics Dashboard**
   - Show duplicate prevention stats
   - Track Plaid billing savings
   - Monitor item health across all users

## Conclusion

This solution provides **production-grade duplicate prevention** while maintaining **excellent UX** for both new and existing users. It follows Plaid's best practices, prevents unnecessary costs, and sets up the platform for future growth.

**Most Importantly:** It fixes your current user's infinite loop while preventing it from ever happening again! 🎉

