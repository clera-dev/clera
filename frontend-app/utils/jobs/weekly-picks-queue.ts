/**
 * PRODUCTION-GRADE: Weekly Stock Picks Job Queue System
 * 
 * This provides proper background job processing for long-running Perplexity generation,
 * ensuring API routes remain fast and reliable while offloading heavy work to workers.
 * 
 * Architecture:
 * - API routes enqueue jobs and return immediately  
 * - Background workers process jobs asynchronously
 * - Database tracks job status for frontend polling
 * - Prevents duplicate jobs with atomic claiming
 * 
 * Usage when restoring production:
 * 1. Remove synchronous generation from API routes
 * 2. Use enqueueWeeklyPicksGeneration() to start jobs
 * 3. Frontend polls job status via existing status tracking
 * 4. Set up worker process to call processWeeklyPicksJobs()
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { claimWeeklyPicksSlot } from '@/utils/db/atomic-claim';
import { generateStockPicksForUser } from '@/utils/services/weekly-stock-picks-generator';

export interface WeeklyPicksJob {
  id: string;
  user_id: string;
  week_of: string;
  priority: 'high' | 'normal' | 'low';
  reason: 'new_user' | 'new_week' | 'error_recovery' | 'manual_trigger';
  created_at: string;
  attempts: number;
  max_attempts: number;
  next_retry_at?: string;
}

/**
 * Enqueue a weekly picks generation job (non-blocking)
 * Call this from API routes instead of synchronous generation
 */
export async function enqueueWeeklyPicksGeneration(
  supabase: SupabaseClient,
  userId: string,
  weekOf: string,
  reason: WeeklyPicksJob['reason'],
  priority: WeeklyPicksJob['priority'] = 'normal'
): Promise<{ success: boolean; jobId?: string; reason?: string }> {
  try {
    // First, atomically claim the generation slot
    const claim = await claimWeeklyPicksSlot(supabase, userId, weekOf, 'sonar-deep-research');
    
    if (!claim.claimed) {
      return { 
        success: false, 
        reason: `Generation already in progress or completed (${claim.reason})` 
      };
    }

    // Create job record (simple table-based queue for now)
    const job: Omit<WeeklyPicksJob, 'id' | 'created_at'> = {
      user_id: userId,
      week_of: weekOf,
      priority,
      reason,
      attempts: 0,
      max_attempts: 3
    };

    const { data: insertedJob, error: jobError } = await supabase
      .from('weekly_picks_jobs')
      .insert([job])
      .select('id')
      .single();

    if (jobError) {
      console.error('Failed to enqueue weekly picks job:', jobError);
      return { success: false, reason: 'Failed to enqueue job' };
    }

    console.log(`📋 Enqueued weekly picks job ${insertedJob.id} for user ${userId} (${reason})`);
    return { success: true, jobId: insertedJob.id };

  } catch (error) {
    console.error('Error enqueueing weekly picks generation:', error);
    return { success: false, reason: 'Internal error' };
  }
}

/**
 * Process pending weekly picks jobs (call from background worker)
 * This is where the actual long-running Perplexity generation happens
 */
export async function processWeeklyPicksJobs(
  supabase: SupabaseClient,
  batchSize: number = 5
): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;

  try {
    // Get pending jobs ordered by priority and creation time
    const { data: jobs, error: fetchError } = await supabase
      .from('weekly_picks_jobs')
      .select('*')
      .is('next_retry_at', null)
      .or('next_retry_at.lte.' + new Date().toISOString())
      .order('priority', { ascending: false }) // high -> normal -> low
      .order('created_at', { ascending: true })  // FIFO within priority
      .limit(batchSize);

    if (fetchError || !jobs?.length) {
      return { processed: 0, errors: 0 };
    }

    console.log(`🔄 Processing ${jobs.length} weekly picks jobs...`);

    // Process jobs sequentially to avoid overwhelming Perplexity API
    for (const job of jobs) {
      try {
        // Mark job as started
        await supabase
          .from('weekly_picks_jobs')
          .update({ attempts: job.attempts + 1 })
          .eq('id', job.id);

        console.log(`⚙️ Processing job ${job.id} for user ${job.user_id} (attempt ${job.attempts + 1})`);

        // Perform the actual generation
        // Create Perplexity client for job processing
        const { OpenAI } = await import('openai');
        const perplexityClient = new OpenAI({
          apiKey: process.env.PPLX_API_KEY,
          baseURL: 'https://api.perplexity.ai',
        });
        
        const result = await generateStockPicksForUser(job.user_id, supabase, perplexityClient);

        if (result) {
          // Success - remove job
          await supabase.from('weekly_picks_jobs').delete().eq('id', job.id);
          console.log(`✅ Completed job ${job.id} for user ${job.user_id}`);
          processed++;
        } else {
          throw new Error('Generation returned null result');
        }

      } catch (jobError) {
        console.error(`❌ Job ${job.id} failed:`, jobError);
        errors++;

        // Handle retry logic
        const nextAttempts = job.attempts + 1;
        if (nextAttempts >= job.max_attempts) {
          // Max attempts reached - mark as failed and remove
          await supabase.from('weekly_picks_jobs').delete().eq('id', job.id);
          
          // Update the picks record to show error state
          await supabase
            .from('user_weekly_stock_picks')
            .update({ status: 'error' })
            .eq('user_id', job.user_id)
            .eq('week_of', job.week_of);

          console.log(`💀 Job ${job.id} failed permanently after ${job.max_attempts} attempts`);
        } else {
          // Schedule retry with exponential backoff
          const retryDelayMs = Math.pow(2, nextAttempts) * 60000; // 2min, 4min, 8min
          const nextRetry = new Date(Date.now() + retryDelayMs).toISOString();
          
          await supabase
            .from('weekly_picks_jobs')
            .update({ 
              attempts: nextAttempts,
              next_retry_at: nextRetry 
            })
            .eq('id', job.id);

          console.log(`⏰ Job ${job.id} scheduled for retry at ${nextRetry}`);
        }
      }

      // Small delay between jobs to be respectful to APIs
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

  } catch (error) {
    console.error('Error processing weekly picks jobs:', error);
    errors++;
  }

  console.log(`📊 Job processing complete: ${processed} processed, ${errors} errors`);
  return { processed, errors };
}

/**
 * Get job status for a user/week (for frontend polling)
 */
export async function getJobStatus(
  supabase: SupabaseClient,
  userId: string,
  weekOf: string
): Promise<{ status: 'pending' | 'processing' | 'completed' | 'failed' | 'not_found'; details?: any }> {
  try {
    // Check for active job
    const { data: job } = await supabase
      .from('weekly_picks_jobs')
      .select('*')
      .eq('user_id', userId)
      .eq('week_of', weekOf)
      .single();

    if (job) {
      return { 
        status: job.attempts > 0 ? 'processing' : 'pending',
        details: { attempts: job.attempts, maxAttempts: job.max_attempts }
      };
    }

    // Check picks record status
    const { data: picks } = await supabase
      .from('user_weekly_stock_picks')
      .select('status')
      .eq('user_id', userId)
      .eq('week_of', weekOf)
      .single();

    if (picks) {
      if (picks.status === 'complete') return { status: 'completed' };
      if (picks.status === 'error') return { status: 'failed' };
    }

    return { status: 'not_found' };

  } catch (error) {
    console.error('Error getting job status:', error);
    return { status: 'not_found' };
  }
}

// SQL to create the jobs table (run this in production setup):
/*
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
*/
