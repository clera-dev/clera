# Onboarding Completion Tracking Architecture

## Overview
This document describes the production-grade solution for tracking onboarding completion in a hybrid platform that offers both **Portfolio Aggregation (Plaid)** and **Brokerage Services (Alpaca)**.

## Problem Statement
The original implementation used a single `status` field for all onboarding states. This worked for single-mode platforms but broke in hybrid mode:
- Users could complete Plaid → `status = "submitted"` → KYC appeared "done"
- Users could complete KYC → `status = "submitted"` → Plaid appeared "done"
- No way to track which features user had actually completed

## Solution: Separate Completion Timestamps

### Database Schema Changes
```sql
-- New columns added to user_onboarding table
ALTER TABLE public.user_onboarding 
ADD COLUMN plaid_connection_completed_at TIMESTAMP WITH TIME ZONE NULL,
ADD COLUMN brokerage_account_completed_at TIMESTAMP WITH TIME ZONE NULL;
```

### Key Design Decisions

#### 1. **Use Timestamps (not Booleans)**
- ✅ Historical data: Know exactly when each milestone was completed
- ✅ Analytics-friendly: Track adoption rates, time-to-completion
- ✅ Audit trail: Compliance and debugging

#### 2. **Nullable Columns**
- ✅ Backward compatible: Existing users have NULL (can backfill if needed)
- ✅ Clear semantics: NULL = not completed, timestamp = completion date

#### 3. **Keep Existing `status` Field**
- ✅ Overall onboarding state: Used by existing logic
- ✅ Non-breaking: Existing code continues to work
- Logic: `status = "submitted"` when **ANY** path is complete

#### 4. **Separate Concerns**
- ✅ Plaid ≠ Brokerage: They are independent features
- ✅ Flexible user journey: User can complete either first
- ✅ Future-proof: Easy to add more providers (Coinbase, Robinhood, etc.)

## Feature Access Logic

### Completion States
```typescript
interface OnboardingStatus {
  status: 'not_started' | 'in_progress' | 'submitted' | 'approved';
  plaid_connection_completed_at: string | null;
  brokerage_account_completed_at: string | null;
}
```

### Access Determination
```typescript
// User can access app if they've completed ANY onboarding path
const canAccessApp = 
  status === 'submitted' || 
  status === 'approved';

// Specific feature access
const hasPlaidAccounts = plaid_connection_completed_at !== null;
const hasBrokerageAccount = brokerage_account_completed_at !== null;

// Show prompts to complete the other path
const shouldPromptForPlaid = hasBrokerageAccount && !hasPlaidAccounts;
const shouldPromptForBrokerage = hasPlaidAccounts && !hasBrokerageAccount;
```

## User Journeys

### Mode 1: Aggregation Only (`FF_BROKERAGE_MODE=false`)
```
Welcome → Personalization → Plaid Connection → /invest
                           ↓
                           plaid_connection_completed_at = NOW()
                           status = "submitted"
```

### Mode 2: Brokerage Only (`FF_AGGREGATION_MODE=false`)
```
Welcome → Personalization → KYC (5 steps) → /invest
                                            ↓
                                            brokerage_account_completed_at = NOW()
                                            status = "submitted"
```

### Mode 3: Hybrid (both flags true)
```
Welcome → Personalization → KYC (5 steps) → Alpaca Account Creation → Loading/Polling
                                            ↓
                                            brokerage_account_completed_at = NOW()
                                            status = "submitted"
                                            ↓
                           Plaid Connection (optional) → /invest
                                            ↓
                                            plaid_connection_completed_at = NOW()
```

**Key Points for Hybrid Mode:**
1. **Brokerage FIRST** - KYC and account creation happen before Plaid
2. **Then Plaid** - After account is active, user can connect external accounts
3. **Both Timestamps Set** - Full onboarding completion tracked independently
4. **User Can Skip** - Plaid is optional, can connect later from portfolio

## Implementation Details

### 1. Save Function Signature
```typescript
export async function saveOnboardingData(
  userId: string,
  onboardingData: OnboardingData,
  status: OnboardingStatus = 'in_progress',
  alpacaData?: {
    accountId?: string;
    accountNumber?: string;
    accountStatus?: string;
  },
  completionType?: 'plaid' | 'brokerage' | null  // NEW PARAMETER
)
```

### 2. Completion Type Logic
```typescript
// In server action
const completionFields: any = {};

if (completionType === 'plaid' && status === 'submitted') {
  completionFields.plaid_connection_completed_at = new Date().toISOString();
} else if (completionType === 'brokerage' && status === 'submitted') {
  completionFields.brokerage_account_completed_at = new Date().toISOString();
}
```

### 3. Call Sites

**Plaid Completion:**
```typescript
await saveOnboardingData(
  userId,
  onboardingData,
  'submitted',
  undefined,  // No Alpaca data
  'plaid'     // Sets plaid_connection_completed_at
);
```

**Brokerage Completion:**
```typescript
await saveOnboardingData(
  userId,
  onboardingData,
  'submitted',
  {
    accountId: alpacaAccountId,
    accountNumber: accountNumber,
    accountStatus: 'ACTIVE'
  },
  'brokerage'  // Sets brokerage_account_completed_at
);
```

## Migration Strategy

### 1. Database Migration
```sql
-- Run migration 006_add_onboarding_completion_tracking.sql
-- Adds columns, indexes, and comments
```

### 2. Backfill Existing Users (Optional)
```sql
-- Users with Alpaca accounts
UPDATE user_onboarding
SET brokerage_account_completed_at = updated_at
WHERE alpaca_account_id IS NOT NULL 
  AND status IN ('submitted', 'approved')
  AND brokerage_account_completed_at IS NULL;

-- Users with Plaid accounts
UPDATE user_onboarding uo
SET plaid_connection_completed_at = (
  SELECT MIN(created_at) 
  FROM user_investment_accounts 
  WHERE user_id = uo.user_id AND provider = 'plaid'
)
WHERE EXISTS (
  SELECT 1 FROM user_investment_accounts 
  WHERE user_id = uo.user_id AND provider = 'plaid'
)
AND plaid_connection_completed_at IS NULL;
```

### 3. Code Deployment
1. Deploy database migration (non-breaking, adds nullable columns)
2. Deploy backend code changes (backward compatible)
3. Deploy frontend code changes
4. Monitor completion timestamps in dashboard

### 4. Gradual Rollout
- Phase 1: Deploy to staging, test all 3 modes
- Phase 2: Deploy to production, monitor existing user flows
- Phase 3: Add UI prompts for completing the "other" path
- Phase 4: Analytics dashboard to track completion rates

## Benefits

### For Users
- ✅ **Flexible onboarding**: Choose which features to enable first
- ✅ **Gradual adoption**: Add brokerage later if started with Plaid
- ✅ **Clear progress**: System knows exactly what user has completed

### For Product Team
- ✅ **Analytics**: Track which features drive adoption
- ✅ **A/B testing**: Test different onboarding sequences
- ✅ **User insights**: Understand user preferences (Plaid vs Brokerage first)

### For Engineering
- ✅ **Non-breaking**: Works with existing code
- ✅ **Extensible**: Easy to add more providers
- ✅ **Debuggable**: Clear completion states
- ✅ **Type-safe**: TypeScript support for completion types

## Testing Checklist

### Aggregation Mode (`FF_BROKERAGE_MODE=false`)
- [ ] New user completes onboarding → `plaid_connection_completed_at` set
- [ ] User redirected to `/invest` after completion
- [ ] `/protected` recognizes completed onboarding

### Brokerage Mode (`FF_AGGREGATION_MODE=false`)
- [ ] New user completes KYC → `brokerage_account_completed_at` set
- [ ] User redirected to `/invest` after completion
- [ ] `/protected` recognizes completed onboarding

### Hybrid Mode (both flags true)
- [ ] User can complete Plaid first → `plaid_connection_completed_at` set
- [ ] User prompted to add brokerage later
- [ ] User can complete brokerage first → `brokerage_account_completed_at` set
- [ ] User prompted to connect Plaid later
- [ ] Both timestamps can be set independently
- [ ] Status remains "submitted" throughout

### Edge Cases
- [ ] User skips Plaid in aggregation mode → no timestamp set
- [ ] User abandons KYC midway → timestamps remain NULL
- [ ] User reconnects Plaid accounts → timestamp not overwritten
- [ ] Existing users (NULL timestamps) → system degrades gracefully

## Future Enhancements

### Short-term
1. **UI Prompts**: Add CTAs to complete the "other" path
2. **Dashboard Widget**: Show completion status and benefits
3. **Email Campaigns**: Encourage users to complete both paths

### Long-term
1. **More Providers**: Add Coinbase, Robinhood tracking
2. **Completion Analytics**: Dashboard showing completion funnels
3. **Personalized Onboarding**: Recommend path based on user profile
4. **Progressive Disclosure**: Only show relevant features based on completion

## Conclusion

This architecture provides a **production-grade foundation** for a hybrid platform offering both aggregation and brokerage services. It's:
- ✅ **Flexible** - Users choose their journey
- ✅ **Scalable** - Easy to add more features
- ✅ **Maintainable** - Clear, well-documented design
- ✅ **Non-breaking** - Works with existing infrastructure
- ✅ **Analytics-ready** - Tracks user behavior

Most importantly: It **solves the infinite loop bug** while setting up the platform for future growth.

