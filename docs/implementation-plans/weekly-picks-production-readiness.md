# Weekly Stock Picks Production Readiness

**Status**: Currently in Static Fallback Mode  
**Last Updated**: 2025-01-27  
**Priority**: Required before production deployment

## Overview

The weekly stock picks system is currently serving static data to minimize costs. When ready to deploy the full personalized system, these **critical production issues** must be addressed to prevent data corruption, duplicate processing, and architectural violations.

## ❌ Issue Status: QUERY LOGIC (FALSE ALARM)

**File**: `frontend-app/utils/jobs/weekly-picks-queue.ts:104`  
**Status**: ✅ **NO FIX NEEDED** - Query logic is correct

The query correctly implements `(next_retry_at IS NULL) OR (next_retry_at <= now)`:
```javascript
.is('next_retry_at', null)
.or('next_retry_at.lte.' + new Date().toISOString())
```

## 🔥 Issue #1: Data Corruption in Status Updates

**File**: `frontend-app/utils/services/weekly-stock-picks-generator.ts:26-49`  
**Severity**: 🔴 **CRITICAL** - Causes data loss  
**Impact**: Status updates wipe existing stock picks and analysis data

### Problem
```javascript
// ❌ BROKEN: Resets all domain data when just updating status
async function updateUserStatus(userId: string, weekOf: string, status: string, supabase: any) {
  await supabase.from('user_weekly_stock_picks').upsert({
    user_id: userId,
    week_of: weekOf,
    status: status,
    stock_picks: [],           // ❌ Wipes existing data
    investment_themes: [],     // ❌ Wipes existing data
    market_analysis: { ... },  // ❌ Wipes existing data
    citations: [],             // ❌ Wipes existing data
  });
}
```

### Required Fix
Create a status-only update function:
```javascript
// ✅ FIXED: Only updates status, preserves existing data
async function updateUserStatus(userId: string, weekOf: string, status: string, supabase: any) {
  await supabase
    .from('user_weekly_stock_picks')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('week_of', weekOf);
}
```

### Files to Update
- `utils/services/weekly-stock-picks-generator.ts` - Fix updateUserStatus function
- Test all status update call sites to ensure no data loss

## 🔥 Issue #2: Race Conditions in Job Processing

**File**: `frontend-app/utils/jobs/weekly-picks-queue.ts:117-144`  
**Severity**: 🔴 **CRITICAL** - Duplicate processing, increased costs  
**Impact**: Multiple workers can process same job, causing duplicate Perplexity API calls ($3-5 per duplicate)

### Problem
```javascript
// ❌ BROKEN: No atomic job claiming
for (const job of jobs) {
  // Multiple workers can pick up the same job
  await supabase.from('weekly_picks_jobs').update({ attempts: job.attempts + 1 }).eq('id', job.id);
  // Race condition here - multiple workers proceed with same job
  const result = await generateStockPicksForUser(job.user_id, supabase, perplexityClient);
}
```

### Required Fix
Implement atomic job claiming:
```javascript
// ✅ FIXED: Atomic job claiming with locking
export async function processWeeklyPicksJobs(supabase: SupabaseClient, batchSize: number = 5) {
  const workerId = `worker-${process.pid}-${Date.now()}`;
  
  // Atomic claim with timestamp-based locking
  const { data: claimedJobs } = await supabase
    .from('weekly_picks_jobs')
    .update({ 
      claimed_by: workerId,
      claimed_at: new Date().toISOString(),
      attempts: supabase.raw('attempts + 1')
    })
    .is('claimed_by', null)
    .or('claimed_at.lt.' + new Date(Date.now() - 300000).toISOString()) // 5min timeout
    .is('next_retry_at', null)
    .or('next_retry_at.lte.' + new Date().toISOString())
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(batchSize)
    .select('*');

  // Process only the jobs this worker successfully claimed
  for (const job of claimedJobs || []) {
    try {
      const result = await generateStockPicksForUser(job.user_id, supabase, perplexityClient);
      if (result) {
        await supabase.from('weekly_picks_jobs').delete().eq('id', job.id);
      }
    } catch (error) {
      // Handle retry logic...
    }
  }
}
```

### Database Schema Update Required
```sql
-- Add locking columns to weekly_picks_jobs table
ALTER TABLE weekly_picks_jobs 
ADD COLUMN claimed_by TEXT,
ADD COLUMN claimed_at TIMESTAMPTZ;

-- Update index for efficient locking queries
CREATE INDEX idx_weekly_picks_jobs_unclaimed 
ON weekly_picks_jobs(priority DESC, created_at ASC) 
WHERE claimed_by IS NULL AND (next_retry_at IS NULL OR next_retry_at <= NOW());
```

### Files to Update
- `utils/jobs/weekly-picks-queue.ts` - Implement atomic job claiming
- Database migration for new columns
- Update job processing logic throughout

## 🔶 Issue #3: Architectural Layer Violation

**File**: `frontend-app/scripts/weekly-picks-worker.js:42-43`  
**Severity**: 🟡 **MEDIUM** - Architectural consistency  
**Impact**: Backend service incorrectly placed in frontend layer

### Problem
```javascript
// ❌ ARCHITECTURAL VIOLATION: Backend worker using frontend environment variables
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,  // ❌ Should not use NEXT_PUBLIC_* in backend
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
```

### Required Fix Options

**Option A: Move to Backend Directory (Recommended)**
```bash
# Move worker to proper backend location
mkdir -p backend/workers
mv frontend-app/scripts/weekly-picks-worker.js backend/workers/
```

Update environment variables:
```javascript
// ✅ FIXED: Use backend-appropriate environment variables
const supabase = createClient(
  process.env.SUPABASE_URL,              // ✅ Backend env var
  process.env.SUPABASE_SERVICE_ROLE_KEY  // ✅ Already correct
);

const requiredEnvVars = [
  'SUPABASE_URL',                        // ✅ Not NEXT_PUBLIC_*
  'SUPABASE_SERVICE_ROLE_KEY',
  'FINANCIAL_MODELING_PREP_API_KEY',
  'PPLX_API_KEY'
];
```

**Option B: Keep in Frontend (Quick Fix)**
```javascript
// ✅ ACCEPTABLE: Use non-public environment variable
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
```

### Files to Update
- Move `scripts/weekly-picks-worker.js` to `backend/workers/`
- Update Docker/deployment scripts to reference new location
- Update documentation references

## 📋 Pre-Production Checklist

Before enabling the full weekly picks system:

### Database Setup
- [ ] Add `claimed_by` and `claimed_at` columns to `weekly_picks_jobs` table
- [ ] Create/update database indexes for job locking
- [ ] Verify unique constraint on `user_weekly_stock_picks(user_id, week_of)`

### Code Fixes
- [ ] Fix `updateUserStatus` function to avoid data corruption
- [ ] Implement atomic job claiming in `processWeeklyPicksJobs`
- [ ] Move worker to backend directory OR fix environment variable usage
- [ ] Update all references to moved files

### Environment Variables
```bash
# Production environment setup
ENABLE_WEEKLY_PICKS_GENERATION=true
SUPABASE_URL=https://your-project.supabase.co           # Backend
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co  # Frontend
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PPLX_API_KEY=your-perplexity-key
CRON_SECRET=your-secure-cron-secret
ALLOWED_ORIGINS=https://app.askclera.com
```

### Testing Requirements
- [ ] Test job processing with multiple workers (no duplicates)
- [ ] Test status updates don't wipe existing data
- [ ] Test graceful worker shutdowns during job processing
- [ ] Verify atomic claiming prevents race conditions
- [ ] Load test with realistic user volumes

### Deployment Architecture
- [ ] Deploy background workers as separate service/container
- [ ] Set up monitoring for job queue health
- [ ] Configure horizontal scaling for workers
- [ ] Set up alerting for failed jobs and data corruption

## Files Requiring Updates

### Critical Fixes (Data Safety)
1. `frontend-app/utils/services/weekly-stock-picks-generator.ts`
   - Fix updateUserStatus function
2. `frontend-app/utils/jobs/weekly-picks-queue.ts`
   - Implement atomic job claiming
3. Database schema
   - Add locking columns

### Architectural Cleanup
4. `frontend-app/scripts/weekly-picks-worker.js` 
   - Move to backend or fix environment variables

### Testing/Verification
5. All job processing call sites
6. Worker deployment scripts
7. Environment variable configurations

## Cost Impact

**Current (Static Mode)**: $0 per user  
**Production (Fixed)**: $3-5 per user per week  
**Production (Broken)**: $9-15+ per user per week due to duplicates

**Fixing these issues prevents 2-3x cost overruns from duplicate processing.**

## Timeline

**Before Production Deployment**: All critical fixes must be completed  
**Estimated Effort**: 1-2 days development + testing  
**Risk if Skipped**: Data corruption, cost overruns, system instability

---

## Next Steps

1. **Schedule Production Deployment Sprint**
2. **Assign Critical Fixes**: Issues #1 and #2 are blocking
3. **Database Migration Planning**: Schema changes require coordination
4. **Worker Deployment Strategy**: Decide on architectural approach
5. **Load Testing**: Verify fixes work under production load

**This system cannot be safely deployed to production until these issues are resolved.**
