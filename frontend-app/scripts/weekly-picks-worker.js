#!/usr/bin/env node

/**
 * PRODUCTION-GRADE: Weekly Picks Background Worker
 * 
 * This script runs continuously to process enqueued weekly picks generation jobs.
 * Deploy this as a separate service/container for production scalability.
 * 
 * Usage:
 *   node scripts/weekly-picks-worker.js
 * 
 * Environment Variables Required:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - FINANCIAL_MODELING_PREP_API_KEY (for generation)
 *   - PERPLEXITY_API_KEY (for generation)
 * 
 * Production Deployment:
 *   - Run as a daemon/systemd service
 *   - Use process managers like PM2 for auto-restart
 *   - Scale horizontally by running multiple workers
 *   - Monitor with logging/metrics systems
 */

require('dotenv').config({ path: '.env.local' });

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
let currentJobs = 0;
let lastJobTime = Date.now();

/**
 * Import the job processor (dynamic import for ES modules)
 */
async function loadJobProcessor() {
  try {
    // Use dynamic import for ES modules from TypeScript
    const module = await import('../utils/jobs/weekly-picks-queue.js');
    return module.processWeeklyPicksJobs;
  } catch (error) {
    console.error('❌ Failed to load job processor. Make sure to build the TypeScript first:', error.message);
    console.log('💡 Run: npm run build');
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
      const { processed, errors } = await processJobs(supabase, WORKER_CONFIG.batchSize);
      
      if (processed > 0 || errors > 0) {
        lastJobTime = Date.now();
        console.log(`📊 Batch complete: ${processed} processed, ${errors} errors`);
      }
      
      // Check for idle timeout (useful for auto-scaling environments)
      const idleTime = Date.now() - lastJobTime;
      if (idleTime > WORKER_CONFIG.maxIdleTime) {
        console.log(`💤 Worker idle for ${Math.round(idleTime / 1000)}s, shutting down...`);
        break;
      }
      
      // Wait before next poll
      await sleep(WORKER_CONFIG.pollIntervalMs);
      
    } catch (error) {
      console.error('❌ Worker error:', error);
      await sleep(5000); // Brief pause on error
    }
  }
  
  console.log('👋 Worker shutting down...');
}

/**
 * Graceful shutdown handler
 */
function setupGracefulShutdown() {
  const shutdown = async (signal) => {
    console.log(`\n🛑 Received ${signal}, starting graceful shutdown...`);
    isShuttingDown = true;
    
    // Wait for current jobs to complete
    const startTime = Date.now();
    while (currentJobs > 0 && (Date.now() - startTime) < WORKER_CONFIG.gracefulShutdownMs) {
      console.log(`⏳ Waiting for ${currentJobs} jobs to complete...`);
      await sleep(1000);
    }
    
    if (currentJobs > 0) {
      console.log(`⚠️ Force stopping with ${currentJobs} jobs still running`);
    }
    
    console.log('✅ Graceful shutdown complete');
    process.exit(0);
  };
  
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

/**
 * Utility functions
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Start the worker
setupGracefulShutdown();
runWorker().catch(error => {
  console.error('💥 Worker crashed:', error);
  process.exit(1);
});

console.log('📝 Worker started with PID:', process.pid);
