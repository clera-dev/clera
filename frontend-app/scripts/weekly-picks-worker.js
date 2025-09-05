#!/usr/bin/env node

/**
 * PRODUCTION-GRADE: Weekly Picks Background Worker
 * 
 * This script runs continuously to process enqueued weekly picks generation jobs.
 * Deploy this as a separate service/container for production scalability.
 * 
 * GRACEFUL SHUTDOWN: Properly tracks in-flight work and waits for completion
 * during SIGTERM/SIGINT to prevent data corruption and stuck job states.
 * 
 * CRITICAL: TypeScript Runtime Required
 *   The worker imports TypeScript modules that require runtime compilation.
 *   Ensure ts-node or tsx is available in your deployment environment.
 * 
 * Usage (Development):
 *   node -r ts-node/register scripts/weekly-picks-worker.js
 *   OR
 *   npx tsx scripts/weekly-picks-worker.js
 * 
 * Usage (Production with ts-node installed globally):
 *   node scripts/weekly-picks-worker.js
 * 
 * Environment Variables Required:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - FINANCIAL_MODELING_PREP_API_KEY (for generation)
 *   - PERPLEXITY_API_KEY (for generation)
 * 
 * Production Deployment:
 *   - Install ts-node in production environment: npm install -g ts-node
 *   - Run as a daemon/systemd service with proper TypeScript support
 *   - Use process managers like PM2 with TypeScript configuration
 *   - Scale horizontally by running multiple workers
 *   - Monitor with logging/metrics systems
 *   - Configure gracefulShutdownMs based on job duration (default: 30s)
 * 
 * Docker Example:
 *   RUN npm install -g ts-node
 *   CMD ["node", "-r", "ts-node/register", "scripts/weekly-picks-worker.js"]
 */

// Load environment variables from .env.local if available (development)
// In production, use real environment variables from the system/container
try { 
  require('dotenv').config({ path: '.env.local' }); 
} catch (e) {
  // dotenv not available in production - use system env vars
  console.log('ℹ️ dotenv not available, using system environment variables');
}

const { createClient } = require('@supabase/supabase-js');

// Validate environment
const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Worker configuration
const WORKER_CONFIG = {
  pollIntervalMs: 30000,     // Check for jobs every 30 seconds
  batchSize: 3,              // Process up to 3 jobs per batch
  maxIdleTime: 600000,       // Exit after 10 minutes of no jobs (for container environments)
  gracefulShutdownMs: 30000  // Wait up to 30s for current jobs to complete
};

let isShuttingDown = false;
let currentJobs = 0; // Track in-flight job batches
let currentBatchSize = 0; // Track individual jobs within current batch  
let lastJobTime = Date.now();

/**
 * Import the job processor - PRODUCTION FIX for TypeScript/build issue
 */
async function loadJobProcessor() {
  try {
    // CRITICAL FIX: Import TypeScript directly since Next.js noEmit prevents JS compilation
    // Node.js will handle TypeScript via ts-node or similar in production environment
    const module = await import('../utils/jobs/weekly-picks-queue.ts');
    return module.processWeeklyPicksJobs;
  } catch (error) {
    console.error('❌ PRODUCTION ERROR: Failed to load job processor');
    console.error('❌ Root cause: TypeScript import in Node.js environment');
    console.error('❌ Error details:', error.message);
    console.log('');
    console.log('🔧 PRODUCTION SETUP REQUIRED:');
    console.log('   Option 1: Install ts-node globally: npm install -g ts-node');
    console.log('   Option 2: Run with: node -r ts-node/register scripts/weekly-picks-worker.js');
    console.log('   Option 3: Compile TypeScript: npx tsc --build');
    console.log('   Option 4: Use tsx: npx tsx scripts/weekly-picks-worker.js');
    console.log('');
    console.log('💡 For containerized deployment, ensure ts-node is available in the runtime environment');
    process.exit(1);
  }
}

/**
 * Main worker loop
 */
async function runWorker() {
  console.log('🚀 Starting Weekly Picks Background Worker...');
  console.log(`📋 Configuration:`, WORKER_CONFIG);
  
  const processJobs = await loadJobProcessor();
  
  while (!isShuttingDown) {
    try {
      // Double-check shutdown status before starting new work
      if (isShuttingDown) {
        console.log('🛑 Shutdown initiated, stopping new job processing...');
        break;
      }
      
      // PRODUCTION FIX: Properly track in-flight work for graceful shutdown
      currentJobs++;
      let jobResult;
      
      try {
        jobResult = await processJobs(supabase, WORKER_CONFIG.batchSize);
        const { processed, errors } = jobResult;
        
        // Track the actual number of jobs in this batch for more granular shutdown control
        currentBatchSize = processed + errors;
        
        if (processed > 0 || errors > 0) {
          lastJobTime = Date.now();
          console.log(`📊 Batch complete: ${processed} processed, ${errors} errors`);
        }
        
      } finally {
        // CRITICAL: Always decrement job counter, even on errors
        currentJobs--;
        currentBatchSize = 0;
      }
      
      // Check for idle timeout (useful for auto-scaling environments)
      const idleTime = Date.now() - lastJobTime;
      if (idleTime > WORKER_CONFIG.maxIdleTime) {
        console.log(`💤 Worker idle for ${Math.round(idleTime / 1000)}s, shutting down...`);
        break;
      }
      
      // Wait before next poll (interruptible for faster shutdown)
      await interruptibleSleep(WORKER_CONFIG.pollIntervalMs);
      
    } catch (error) {
      console.error('❌ Worker error:', error);
      // Use regular sleep for error recovery - don't interrupt error handling
      await sleep(5000); 
    }
  }
  
  console.log('👋 Worker shutting down...');
}

/**
 * Graceful shutdown handler - PRODUCTION GRADE
 */
function setupGracefulShutdown() {
  const shutdown = async (signal) => {
    console.log(`\n🛑 Received ${signal}, starting graceful shutdown...`);
    isShuttingDown = true;
    
    // Wait for current jobs to complete with enhanced tracking
    const startTime = Date.now();
    let lastLogTime = 0;
    
    while (currentJobs > 0 && (Date.now() - startTime) < WORKER_CONFIG.gracefulShutdownMs) {
      const elapsed = Date.now() - startTime;
      const remaining = WORKER_CONFIG.gracefulShutdownMs - elapsed;
      
      // Log every 2 seconds to avoid spam, but provide detailed info
      if (Date.now() - lastLogTime > 2000) {
        const batchInfo = currentBatchSize > 0 ? ` (processing ${currentBatchSize} individual jobs)` : '';
        console.log(`⏳ Waiting for ${currentJobs} job batch(es) to complete${batchInfo} - ${Math.round(remaining / 1000)}s remaining`);
        lastLogTime = Date.now();
      }
      
      await sleep(100); // Check more frequently for responsive shutdown
    }
    
    if (currentJobs > 0) {
      const batchInfo = currentBatchSize > 0 ? ` with ${currentBatchSize} individual jobs in current batch` : '';
      console.log(`⚠️  FORCE SHUTDOWN: Terminating with ${currentJobs} job batch(es) still running${batchInfo}`);
      console.log(`⚠️  This may leave some jobs in inconsistent database states - monitor for stuck 'started' status`);
    } else {
      console.log('✅ All jobs completed cleanly');
    }
    
    console.log('✅ Graceful shutdown complete');
    process.exit(0);
  };
  
  // Handle multiple signals that could terminate the worker
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT')); 
  process.on('SIGHUP', () => shutdown('SIGHUP'));
}

/**
 * Utility functions
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Interruptible sleep that checks shutdown status periodically
 * This allows for responsive shutdown during long polling intervals
 */
async function interruptibleSleep(ms) {
  const sleepChunk = 1000; // Check shutdown every 1 second
  const chunks = Math.ceil(ms / sleepChunk);
  
  for (let i = 0; i < chunks; i++) {
    if (isShuttingDown) {
      console.log(`🛑 Sleep interrupted for shutdown after ${i}s of ${Math.ceil(ms/1000)}s`);
      return;
    }
    
    const remainingMs = Math.min(sleepChunk, ms - (i * sleepChunk));
    await sleep(remainingMs);
  }
}

// Production safety: Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 UNCAUGHT EXCEPTION - Worker terminating:', error);
  console.error('Stack:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 UNHANDLED REJECTION at:', promise, 'reason:', reason);
  console.error('Stack:', reason?.stack);
  process.exit(1);
});

// Start the worker
console.log('📝 Worker starting with PID:', process.pid);
setupGracefulShutdown();
runWorker().catch(error => {
  console.error('💥 Worker crashed:', error);
  process.exit(1);
});

console.log('✅ Worker initialized successfully');
