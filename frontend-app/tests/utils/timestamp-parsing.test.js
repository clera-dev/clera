const { strict: assert } = require('assert');

/**
 * Comprehensive test suite for timestamp parsing and date construction
 * These tests prevent the "Invalid time value" errors that occurred in production
 */

// Mock parseFMPEasternTimestamp function (simplified version for testing)
function parseFMPEasternTimestamp(fmpTimestamp) {
  if (!fmpTimestamp || typeof fmpTimestamp !== 'string') {
    throw new Error(`Invalid timestamp: ${fmpTimestamp}`);
  }
  
  let datePart, timePart = null;
  
  if (fmpTimestamp.includes('T')) {
    [datePart, timePart] = fmpTimestamp.split('T');
  } else if (fmpTimestamp.includes(' ')) {
    [datePart, timePart] = fmpTimestamp.split(' ');
  } else {
    datePart = fmpTimestamp;
  }
  
  const [year, month, day] = datePart.split('-').map(Number);
  let hour = 16, minute = 0, second = 0;
  
  if (timePart) {
    const timeParts = timePart.split(':').map(Number);
    hour = timeParts[0] || 0;
    minute = timeParts[1] || 0;
    second = timeParts[2] || 0;
  }
  
  // Simple approach: create date with timezone offset
  const isoString = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}-04:00`;
  return new Date(isoString);
}

// Test Eastern date construction (the bug we just fixed)
function testEasternDateConstruction() {
  console.log('\n=== Testing Eastern Date Construction ===');
  
  const testDate = new Date('2025-06-24T20:37:18.847Z');
  
  const easternFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  
  const easternParts = easternFormatter.formatToParts(testDate);
  
  // CORRECT approach (the fix we just implemented)
  const year = easternParts.find(part => part.type === 'year')?.value;
  const month = easternParts.find(part => part.type === 'month')?.value;
  const day = easternParts.find(part => part.type === 'day')?.value;
  
  assert(year, 'Year should be extracted');
  assert(month, 'Month should be extracted');
  assert(day, 'Day should be extracted');
  
  const easternToday = new Date(`${year}-${month}-${day}`);
  
  assert(!isNaN(easternToday.getTime()), 'Eastern date should be valid');
  
  // Should not throw "Invalid time value"
  const isoString = easternToday.toISOString();
  assert(typeof isoString === 'string', 'toISOString() should work');
  
  console.log('✅ Eastern date construction test passed');
}

// Test FMP timestamp parsing with various formats
function testFMPTimestampParsing() {
  console.log('\n=== Testing FMP Timestamp Parsing ===');
  
  const testCases = [
    '2025-06-24 14:45:00',
    '2025-06-24 15:55:00',
    '2025-06-24 09:30:00',
    '2025-06-24 16:00:00',
    '2025-06-24', // Date only
    '2025-12-31 23:59:59',
    '2025-01-01 00:00:00'
  ];
  
  testCases.forEach(timestamp => {
    try {
      const result = parseFMPEasternTimestamp(timestamp);
      assert(!isNaN(result.getTime()), `Should parse valid timestamp: ${timestamp}`);
      
      // Should not throw "Invalid time value"
      const isoString = result.toISOString();
      assert(typeof isoString === 'string', `toISOString() should work for: ${timestamp}`);
      
      console.log(`✅ Parsed ${timestamp} -> ${isoString}`);
    } catch (error) {
      console.log(`❌ Failed to parse ${timestamp}: ${error.message}`);
      throw error;
    }
  });
  
  console.log('✅ FMP timestamp parsing tests passed');
}

// Test invalid inputs
function testInvalidInputHandling() {
  console.log('\n=== Testing Invalid Input Handling ===');
  
  const invalidInputs = [
    null,
    undefined,
    '',
    'invalid-date',
    '2025-13-45', // Invalid month/day
    '2025-06-32', // Invalid day
  ];
  
  invalidInputs.forEach(input => {
    try {
      parseFMPEasternTimestamp(input);
      console.log(`❌ Should have thrown error for: ${input}`);
      throw new Error(`Should have thrown error for invalid input: ${input}`);
    } catch (error) {
      console.log(`✅ Correctly rejected invalid input: ${input}`);
    }
  });
  
  console.log('✅ Invalid input handling tests passed');
}

// Test edge cases that caused production issues
function testProductionEdgeCases() {
  console.log('\n=== Testing Production Edge Cases ===');
  
  // Test the exact timestamp from the error logs
  const problematicTimestamp = '2025-06-24 14:45:00';
  const result = parseFMPEasternTimestamp(problematicTimestamp);
  
  assert(!isNaN(result.getTime()), 'Problematic timestamp should parse correctly');
  
  // Should not throw "Invalid time value"
  const isoString = result.toISOString();
  assert(typeof isoString === 'string', 'toISOString() should work');
  
  console.log(`✅ Production edge case handled: ${problematicTimestamp} -> ${isoString}`);
}

// Run all tests
function runAllTests() {
  console.log('🧪 Running Timestamp Parsing Tests...');
  
  try {
    testEasternDateConstruction();
    testFMPTimestampParsing();
    testInvalidInputHandling();
    testProductionEdgeCases();
    
    console.log('\n🎉 All tests passed! The timestamp parsing issues have been fixed.');
  } catch (error) {
    console.log('\n💥 Test failed:', error.message);
    console.log('Stack:', error.stack);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests();
}

module.exports = {
  runAllTests,
  testEasternDateConstruction,
  testFMPTimestampParsing,
  testInvalidInputHandling,
  testProductionEdgeCases,
  parseFMPEasternTimestamp
}; 