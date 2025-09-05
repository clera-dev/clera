# 🚧 TEMPORARY: Static Fallback Mode for Cost Optimization

**⚠️ IMPORTANT: This is a temporary cost-optimization measure. All changes should be easily reversible.**

## Overview

The weekly stock picks system has been temporarily modified to serve **static data to all users** instead of running expensive Perplexity Deep Research generation for each user. This provides users with a high-quality preview of the personalized experience while minimizing costs during the validation phase.

## What Changed

### 1. Cron Job Disabled (`vercel.json`)
```json
// TEMPORARILY DISABLED: Expensive Perplexity Deep Research cron job
// {
//   "path": "/api/cron/generate-weekly-stock-picks", 
//   "schedule": "30 12 * * 1"  // Every Monday 5:30 AM Pacific
// }
```
NOTE: This was actually completely removed because comments are not allowed in JSON files. So this will need to be added to our vercel.json once ready for production implementation)

### 2. API Route Simplified (`app/api/investment/weekly-picks/route.ts`)
- **Before**: Complex logic for database queries, status management, and on-demand generation
- **After**: Simple static data loader that serves the same data to all users
- **Original Logic**: Preserved in comments for easy restoration

### 3. Static Data System Created
- **Data Source**: `lib/data/static-weekly-picks-fallback.json`
  - Contains 6 stock picks, 4 investment themes, market analysis, and 20 citations
  - Extracted from user `4123fb3b-f48c-49a7-9991-21674f125d83` (high-quality Perplexity output)
  - Generated on 2025-08-26 for week 2025-08-25

- **Service Layer**: `lib/services/static-weekly-picks-service.ts`
  - Provides consistent API interface
  - Handles week_of dating and response formatting
  - Clear documentation about temporary nature

### 4. Frontend Compatibility Maintained
- All existing components work without changes
- Same API response format preserved
- Loading states and error handling intact
- Users see `fallback_reason: 'cost_optimization'`

## File Structure

```
frontend-app/
├── lib/
│   ├── data/
│   │   └── static-weekly-picks-fallback.json     # Static data source
│   └── services/
│       └── static-weekly-picks-service.ts        # Static data loader
├── app/api/investment/weekly-picks/
│   └── route.ts                                  # Simplified API (original logic commented)
├── utils/
│   ├── extract-user-data-for-static-fallback.js # Data extraction script
│   └── find-users-with-data.js                  # User discovery script
└── vercel.json                                   # Cron job disabled
```

## User Experience

### Current (Static Mode)
- **All users** see the same high-quality stock picks and investment themes
- **Fast loading** (~100ms response time)
- **No waiting** for generation
- **Preview experience** of what personalized content will look like
- **Cost**: ~$0 per user

### Future (Production Mode)
- **Personalized content** based on individual user profiles
- **Dynamic generation** via Perplexity Deep Research
- **Weekly updates** via cron job
- **Real-time generation** for new users
- **Cost**: ~$3-5 per user per week

## Data Quality

The static data includes:
- ✅ **6 Stock Picks**: PLTR, AVGO, AKAM, TER, CEG, CRWD
- ✅ **4 Investment Themes**: AI Utility Surge, Semiconductor Renaissance, Cloud Evolution, Security Imperative  
- ✅ **Market Analysis**: Current environment, risk factors, opportunities
- ✅ **20 Citations**: Real sources from Morningstar, NerdWallet, etc.
- ✅ **Proper Formatting**: Bullet points and paragraphs for mobile readability

## How to Restore Production Mode

### Step 1: Re-enable Cron Job
In `vercel.json`, uncomment the cron job:
```json
{
  "path": "/api/cron/generate-weekly-stock-picks", 
  "schedule": "30 12 * * 1"  // Every Monday 5:30 AM Pacific
}
```

### Step 2: Restore API Logic
In `app/api/investment/weekly-picks/route.ts`:
1. Remove the static service import
2. Replace the simplified `GET` function with the original production logic (preserved in comments)
3. The original logic handles:
   - Database queries for current/recent picks
   - Status management (pending → started → processing → complete/error)
   - Race condition prevention with atomic slot claiming
   - On-demand Perplexity generation for new users
   - Error handling and state management

#### Step 2b: Use atomic claim to prevent duplicate generation (critical)
When re-enabling on-demand generation, do NOT use UPSERT to "claim" a job. It is not atomic and can trigger duplicate Deep Research runs.

Use the atomic claim helper instead:

- Helper file: `utils/db/atomic-claim.ts`
- Strategy: conditional UPDATE where status IN ('pending','error') → if 0 rows, INSERT started row; treat unique violation as lost race

Example usage (replace the UPSERT claim code):

```ts
const { claimWeeklyPicksSlot } = await import('@/utils/db/atomic-claim');

const claim = await claimWeeklyPicksSlot(
  supabaseService, // service-role client
  user.id,
  currentWeekMonday,
  'sonar-deep-research'
);

if (!claim.claimed) {
  // Someone else is generating or generation already started
  return NextResponse.json({
    success: true,
    data: null,
    metadata: {
      generated_at: null,
      week_of: currentWeekMonday,
      cached: false,
      fallback_reason: 'generation_in_progress'
    }
  } as WeeklyStockPicksResponse);
}
```

Requirements:
- Ensure a unique constraint/index exists on `(user_id, week_of)` for `user_weekly_stock_picks`.
- Reuse the same atomic helper in the cron route if you allow manual triggers in parallel with cron.

#### Step 2c: Use a DST‑safe Pacific Monday calculation
Avoid `toLocaleString` + string parsing. Use `Intl.DateTimeFormat(...).formatToParts` to compute Pacific Monday (see cron route implementation for `getMondayOfWeek`). This prevents subtle DST bugs and week rollovers.

#### Step 2d: Separate read and write operations for security AND scalability
The original GET endpoint performed both CSRF-vulnerable state changes AND long-running synchronous generation (30-60 seconds), which violates proper API layering. When re-enabling production:

1. **Keep GET as read-only**: Only fetch and return existing data (no generation)
2. **Use background job architecture**: 
   - **Option A (Simple)**: Use the existing secure POST endpoint at `/api/investment/weekly-picks/generate` for manual triggers
   - **Option B (Minimal)**: Rely purely on the cron job for scheduled generation
   - **Option C (Production Scale)**: Use the provided job queue system (`utils/jobs/weekly-picks-queue.ts`)

3. **Enable CSRF protection**: Set environment variables:
   ```bash
   ENABLE_WEEKLY_PICKS_GENERATION=true
   ALLOWED_ORIGINS=https://yourapp.com,https://www.yourapp.com
   ```

4. **Frontend UX pattern**: 
   - GET shows loading state for new users (`isNewUser: true`)
   - Optionally provide a "Generate Now" button that calls POST
   - Use polling or WebSocket to update when background job completes

**Why this matters**:
- **Scalability**: Long API routes (30-60s) hit platform limits and create poor UX
- **Reliability**: Synchronous generation can fail mid-process and leave inconsistent state
- **Security**: GET should never have side effects (CSRF prevention)
- **Proper layering**: Presentation layer (API) vs. processing layer (background jobs)

The secure POST endpoint already exists at `app/api/investment/weekly-picks/generate/route.ts` and includes:
- Authentication enforcement
- CSRF protection via Origin/Referer validation
- Atomic claim prevention of duplicate generation
- Feature flag gating (`ENABLE_WEEKLY_PICKS_GENERATION`)

### Step 3: Clean Up Static Files
Delete these temporary files:
- `lib/data/static-weekly-picks-fallback.json`
- `lib/services/static-weekly-picks-service.ts`
- `utils/extract-user-data-for-static-fallback.js`
- `utils/find-users-with-data.js`
- This documentation file

### Step 3b: Security and Environment Setup
Before going live, ensure these security measures are in place:

1. **Environment Variables**:
   ```bash
   # Required for production generation
   ENABLE_WEEKLY_PICKS_GENERATION=true
   ALLOWED_ORIGINS=https://yourapp.com
   
   # Existing required vars
   CRON_SECRET=your-secure-cron-secret
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   FINANCIAL_MODELING_PREP_API_KEY=your-fmp-key
   PPLX_API_KEY=your-api-key
   ```

2. **Database Constraints**: Ensure unique constraint exists on `user_weekly_stock_picks(user_id, week_of)`

3. **CSRF Protection**: Verify `ALLOWED_ORIGINS` matches your production domain(s)

4. **Rate Limiting**: Consider adding rate limiting to the generate endpoint if manual triggers are allowed

## Production-Grade Job Queue Setup (Option C)

For high-scale production, use the provided job queue system instead of synchronous generation:

### Files Created:
- `utils/jobs/weekly-picks-queue.ts` - Job queue management
- `scripts/weekly-picks-worker.js` - Background worker process

### Setup Steps:

1. **Create the jobs table**:
   ```sql
   CREATE TABLE weekly_picks_jobs (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     week_of DATE NOT NULL,
     priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('high', 'normal', 'low')),
     reason TEXT NOT NULL CHECK (reason IN ('new_user', 'new_week', 'error_recovery', 'manual_trigger')),
     attempts INTEGER NOT NULL DEFAULT 0,
     max_attempts INTEGER NOT NULL DEFAULT 3,
     next_retry_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE(user_id, week_of)
   );
   
   CREATE INDEX idx_weekly_picks_jobs_priority_created 
   ON weekly_picks_jobs(priority DESC, created_at ASC) 
   WHERE next_retry_at IS NULL OR next_retry_at <= NOW();
   ```

2. **Update API routes to use job queue**:
   ```ts
   // In API routes, replace synchronous generation with:
   import { enqueueWeeklyPicksGeneration } from '@/utils/jobs/weekly-picks-queue';
   
   const { success, jobId } = await enqueueWeeklyPicksGeneration(
     supabase, userId, weekOf, 'new_user', 'high'
   );
   ```

3. **Deploy background worker**:
   ```bash
   # Build the TypeScript first
   npm run build
   
   # Run the worker
   node scripts/weekly-picks-worker.js
   
   # Or with PM2 for production
   pm2 start scripts/weekly-picks-worker.js --name "weekly-picks-worker"
   ```

4. **Frontend polling**:
   ```ts
   // Frontend can poll job status
   import { getJobStatus } from '@/utils/jobs/weekly-picks-queue';
   
   const status = await getJobStatus(supabase, userId, weekOf);
   // Returns: 'pending' | 'processing' | 'completed' | 'failed' | 'not_found'
   ```

### Benefits:
- **⚡ Fast API responses**: Routes return immediately after enqueueing
- **🔄 Automatic retries**: Failed jobs retry with exponential backoff
- **📊 Priority queuing**: New users get higher priority than weekly updates
- **🛡️ Fault tolerance**: Worker crashes don't lose jobs
- **📈 Horizontal scaling**: Run multiple workers for high load

### Step 4: Test Production Flow
1. Create a new test user
2. Visit `/invest` page
3. Verify loading state appears
4. Wait for Perplexity generation (~30-60 seconds)
5. Verify personalized data appears
6. Check that cron job runs on Mondays

## Architecture Benefits

This approach provides several advantages:

1. **🔄 Easy Reversibility**: All production logic preserved in comments
2. **🎯 Same Interface**: Frontend components require no changes
3. **📊 Real Data**: Users see actual high-quality investment research
4. **💰 Cost Control**: Zero per-user costs during validation phase
5. **🚀 Performance**: Instant loading for better UX
6. **🧪 Validation**: Gather user feedback without financial risk

## Monitoring & Analytics

Track these metrics during static mode:
- User engagement with stock picks
- Investment theme interaction rates  
- Time spent reading rationales
- Citation click-through rates
- User feedback on content quality

This data will help validate whether the expensive personalization is worth the cost.

## Questions or Issues?

If you need to:
- **Extract data from a different user**: Use `utils/extract-user-data-for-static-fallback.js`
- **Update the static data**: Replace the JSON file and restart the application
- **Debug the static system**: Check console logs for `[STATIC MODE]` messages
- **Restore production**: Follow the steps above and test thoroughly

---

**Last Updated**: 2025-08-28  
**Mode**: Static Fallback (Temporary)  
**Next Review**: After user feedback collection

## Recent Architectural Improvements

### ✅ **Secret Boundary Violation Fixed** (2025-08-28)
- **Issue**: `utils/services/weekly-stock-picks-generator.ts` directly accessed `process.env.PPLX_API_KEY`, violating server-only boundary
- **Solution**: Implemented dependency injection pattern:
  - Perplexity client creation moved to API routes (server-only boundary)
  - Generator utility now receives client as parameter 
  - Maintains environment-agnostic utils architecture
- **Files Updated**:
  - `utils/services/weekly-stock-picks-generator.ts` - Added `perplexityClient` parameter
  - `app/api/investment/weekly-picks/generate/route.ts` - Creates and injects client
  - `app/api/cron/generate-weekly-stock-picks/route.ts` - Creates and injects client  
  - `app/api/investment/weekly-picks/route.ts` - Updates commented production logic

### ✅ **Production Worker Crash Fixed** (2025-08-28)
- **Issue**: `scripts/weekly-picks-worker.js` unconditionally required `dotenv` which is in devDependencies, causing production crashes
- **Solution**: Made dotenv loading optional via try/catch:
  - Worker gracefully falls back to system environment variables
  - Prevents crashes in production/container environments
  - Maintains development convenience with .env.local files
- **Files Updated**:
  - `scripts/weekly-picks-worker.js` - Added try/catch around dotenv loading
