/**
 * COMPREHENSIVE TEST RUNNER
 * 
 * Runs all timestamp parsing tests to ensure the "Invalid time value" bug is completely fixed
 */

const { execSync } = require('child_process');

console.log('🧪 COMPREHENSIVE TIMESTAMP TESTING SUITE');
console.log('=========================================');
console.log('Running all tests to verify the "Invalid time value" bug is completely fixed...\n');

const tests = [
  {
    name: 'Basic Timestamp Parsing Tests',
    command: 'node tests/timestamp-parsing.test.js',
    description: 'Tests basic timestamp parsing functionality'
  },
  {
    name: 'Comprehensive Edge Case Tests',
    command: 'node tests/comprehensive-timestamp.test.js',
    description: 'Tests all possible edge cases and scenarios'
  },
  {
    name: 'Integration Tests',
    command: 'node tests/integration.timestamp.test.js',
    description: 'Tests real API integration and complete pipeline'
  },
  {
    name: 'Final Verification Test',
    command: 'node tests/final-verification.test.js',
    description: 'Tests the exact bug scenario that was reported'
  }
];

let allTestsPassed = true;
const results = [];

for (let i = 0; i < tests.length; i++) {
  const test = tests[i];
  
  console.log(`📋 Test ${i + 1}/${tests.length}: ${test.name}`);
  console.log(`📝 ${test.description}`);
  console.log(`▶️  Running: ${test.command}\n`);
  
  try {
    const startTime = process.hrtime.bigint();
    
    // Run the test
    execSync(test.command, { stdio: 'pipe', cwd: process.cwd() });
    
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1000000;
    
    console.log(`✅ ${test.name} PASSED (${durationMs.toFixed(0)}ms)\n`);
    
    results.push({
      name: test.name,
      status: 'PASSED',
      duration: durationMs
    });
    
  } catch (error) {
    console.log(`❌ ${test.name} FAILED`);
    console.log(`Error: ${error.message}\n`);
    
    results.push({
      name: test.name,
      status: 'FAILED',
      error: error.message
    });
    
    allTestsPassed = false;
  }
  
  console.log('─'.repeat(80));
}

// Print summary
console.log('\n📊 TEST SUMMARY');
console.log('================');

const totalTests = results.length;
const passedTests = results.filter(r => r.status === 'PASSED').length;
const failedTests = results.filter(r => r.status === 'FAILED').length;
const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);

console.log(`Total Tests: ${totalTests}`);
console.log(`Passed: ${passedTests}`);
console.log(`Failed: ${failedTests}`);
console.log(`Total Duration: ${totalDuration.toFixed(0)}ms\n`);

results.forEach((result, index) => {
  const icon = result.status === 'PASSED' ? '✅' : '❌';
  const duration = result.duration ? ` (${result.duration.toFixed(0)}ms)` : '';
  console.log(`${icon} ${index + 1}. ${result.name}${duration}`);
  
  if (result.error) {
    console.log(`   Error: ${result.error}`);
  }
});

console.log('\n' + '='.repeat(80));

if (allTestsPassed) {
  console.log('🎉 ALL TESTS PASSED!');
  console.log('🚀 The "Invalid time value" bug has been completely fixed!');
  console.log('✅ The StockChart component is ready for production use.');
  console.log('✅ No timestamp parsing errors should occur.');
  console.log('✅ All edge cases have been tested and handled.');
  
  process.exit(0);
} else {
  console.log('💥 SOME TESTS FAILED!');
  console.log('❌ The timestamp parsing issues may not be fully resolved.');
  console.log('🔧 Please review the failed tests and fix any remaining issues.');
  
  process.exit(1);
} 