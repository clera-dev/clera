#!/usr/bin/env node

/**
 * Performance Testing Script for Portfolio Allocation Optimization
 * 
 * This script helps verify the performance improvements by:
 * 1. Measuring API response times
 * 2. Testing cache hit rates
 * 3. Simulating user tab switching behavior
 * 
 * Run with: node scripts/test-allocation-performance.js
 */

const performance = require('perf_hooks').performance;

// Configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const TEST_ACCOUNT_ID = process.env.TEST_ACCOUNT_ID || 'test-account';
const TEST_USER_ID = process.env.TEST_USER_ID;

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logHeader(message) {
  console.log('\n' + '='.repeat(60));
  log(message, colors.bright + colors.blue);
  console.log('='.repeat(60) + '\n');
}

function logSuccess(message) {
  log(`✅ ${message}`, colors.green);
}

function logWarning(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

function logError(message) {
  log(`❌ ${message}`, colors.red);
}

async function measureApiCall(url, description) {
  const startTime = performance.now();
  
  try {
    const response = await fetch(url, {
      headers: {
        'Cache-Control': 'no-cache',
      },
    });
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    if (response.ok) {
      const data = await response.json();
      return { success: true, duration, data, description };
    } else {
      return { success: false, duration, error: `HTTP ${response.status}`, description };
    }
  } catch (error) {
    const endTime = performance.now();
    const duration = endTime - startTime;
    return { success: false, duration, error: error.message, description };
  }
}

async function testInitialLoad() {
  logHeader('Test 1: Initial Page Load (Cold Cache)');
  
  const assetClassUrl = `${API_BASE_URL}/api/portfolio/cash-stock-bond-allocation?accountId=${TEST_ACCOUNT_ID}`;
  const sectorUrl = `${API_BASE_URL}/api/portfolio/sector-allocation?account_id=${TEST_ACCOUNT_ID}`;
  
  log('Simulating parallel data fetch on page load...', colors.blue);
  
  const startTime = performance.now();
  const [assetClassResult, sectorResult] = await Promise.all([
    measureApiCall(assetClassUrl, 'Asset Class Allocation'),
    measureApiCall(sectorUrl, 'Sector Allocation'),
  ]);
  const totalTime = performance.now() - startTime;
  
  console.log('\nResults:');
  console.log(`  Asset Class API: ${assetClassResult.duration.toFixed(2)}ms`);
  console.log(`  Sector API: ${sectorResult.duration.toFixed(2)}ms`);
  console.log(`  Total (Parallel): ${totalTime.toFixed(2)}ms`);
  
  if (assetClassResult.success && sectorResult.success) {
    logSuccess(`Both APIs loaded successfully in ${totalTime.toFixed(2)}ms`);
  } else {
    logError('One or more APIs failed');
  }
  
  if (totalTime < 500) {
    logSuccess('Performance target met: < 500ms ⚡');
  } else {
    logWarning(`Slower than target: ${totalTime.toFixed(2)}ms > 500ms`);
  }
  
  return { assetClassResult, sectorResult, totalTime };
}

async function testCacheHitRate() {
  logHeader('Test 2: Cache Hit Rate (Backend Cache)');
  
  const url = `${API_BASE_URL}/api/portfolio/sector-allocation?account_id=${TEST_ACCOUNT_ID}`;
  
  log('Making 5 consecutive requests to test cache...', colors.blue);
  
  const results = [];
  for (let i = 0; i < 5; i++) {
    const result = await measureApiCall(url, `Request ${i + 1}`);
    results.push(result);
    console.log(`  Request ${i + 1}: ${result.duration.toFixed(2)}ms`);
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
  const firstCallDuration = results[0].duration;
  const cachedCallsAvg = results.slice(1).reduce((sum, r) => sum + r.duration, 0) / (results.length - 1);
  
  console.log('\nAnalysis:');
  console.log(`  First call (cache miss): ${firstCallDuration.toFixed(2)}ms`);
  console.log(`  Cached calls average: ${cachedCallsAvg.toFixed(2)}ms`);
  console.log(`  Improvement: ${((firstCallDuration - cachedCallsAvg) / firstCallDuration * 100).toFixed(1)}%`);
  
  if (cachedCallsAvg < firstCallDuration * 0.5) {
    logSuccess('Backend caching is working effectively! 🚀');
  } else {
    logWarning('Cache may not be working optimally');
  }
  
  return { results, avgDuration, cachedCallsAvg };
}

async function testTabSwitching() {
  logHeader('Test 3: Simulated Tab Switching');
  
  const assetClassUrl = `${API_BASE_URL}/api/portfolio/cash-stock-bond-allocation?accountId=${TEST_ACCOUNT_ID}`;
  const sectorUrl = `${API_BASE_URL}/api/portfolio/sector-allocation?account_id=${TEST_ACCOUNT_ID}`;
  
  log('Simulating user switching between tabs...', colors.blue);
  
  // Simulate: Page load (both fetch), switch to sector, switch back to asset class
  console.log('\n1. Initial load (both tabs prefetch)');
  const loadStart = performance.now();
  await Promise.all([
    measureApiCall(assetClassUrl, 'Asset Class'),
    measureApiCall(sectorUrl, 'Sector'),
  ]);
  const loadTime = performance.now() - loadStart;
  console.log(`   ⏱  ${loadTime.toFixed(2)}ms`);
  
  // Wait a bit to simulate user viewing the page
  await new Promise(resolve => setTimeout(resolve, 500));
  
  console.log('\n2. User switches to "By Sector" tab');
  const sectorSwitchStart = performance.now();
  const sectorResult = await measureApiCall(sectorUrl, 'Sector (cached)');
  const sectorSwitchTime = performance.now() - sectorSwitchStart;
  console.log(`   ⏱  ${sectorSwitchTime.toFixed(2)}ms`);
  
  if (sectorSwitchTime < 200) {
    logSuccess('Cache hit! Near-instant tab switch ⚡');
  }
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  console.log('\n3. User switches back to "By Asset Class" tab');
  const assetSwitchStart = performance.now();
  const assetResult = await measureApiCall(assetClassUrl, 'Asset Class (cached)');
  const assetSwitchTime = performance.now() - assetSwitchStart;
  console.log(`   ⏱  ${assetSwitchTime.toFixed(2)}ms`);
  
  if (assetSwitchTime < 200) {
    logSuccess('Cache hit! Near-instant tab switch ⚡');
  }
  
  console.log('\nSummary:');
  console.log(`  Initial load: ${loadTime.toFixed(2)}ms`);
  console.log(`  Tab switches: ${sectorSwitchTime.toFixed(2)}ms + ${assetSwitchTime.toFixed(2)}ms`);
  console.log(`  Average switch time: ${((sectorSwitchTime + assetSwitchTime) / 2).toFixed(2)}ms`);
  
  const avgSwitchTime = (sectorSwitchTime + assetSwitchTime) / 2;
  if (avgSwitchTime < 100) {
    logSuccess('Excellent tab switching performance! 🎉');
  } else if (avgSwitchTime < 300) {
    logSuccess('Good tab switching performance ✓');
  } else {
    logWarning('Tab switching could be faster');
  }
}

async function runAllTests() {
  console.log('\n');
  log('🚀 Portfolio Allocation Performance Testing', colors.bright + colors.blue);
  log('Testing optimizations for asset allocation component\n', colors.blue);
  
  if (!TEST_USER_ID) {
    logWarning('TEST_USER_ID not set - using default test account');
    logWarning('Set TEST_USER_ID environment variable for accurate testing\n');
  }
  
  try {
    // Test 1: Initial Load
    const loadResults = await testInitialLoad();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test 2: Cache Hit Rate
    const cacheResults = await testCacheHitRate();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test 3: Tab Switching
    await testTabSwitching();
    
    // Final Summary
    logHeader('Performance Testing Complete');
    
    console.log('Key Metrics:');
    console.log(`  ✓ Initial parallel load: ${loadResults.totalTime.toFixed(2)}ms`);
    console.log(`  ✓ Cached request speed: ${cacheResults.cachedCallsAvg.toFixed(2)}ms`);
    console.log(`  ✓ Cache improvement: ${((loadResults.totalTime - cacheResults.cachedCallsAvg) / loadResults.totalTime * 100).toFixed(1)}%`);
    
    logSuccess('\n🎉 All performance tests completed!');
    
    console.log('\nNext Steps:');
    console.log('  1. Test with real user session (set TEST_USER_ID)');
    console.log('  2. Monitor cache hit rates in production');
    console.log('  3. Set up performance dashboards');
    console.log('  4. Gather user feedback\n');
    
  } catch (error) {
    logError(`\nTest failed with error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { measureApiCall, testInitialLoad, testCacheHitRate, testTabSwitching };

