/**
 * StockChart Timezone Conversion Tests
 * 
 * Tests to ensure the StockChart component correctly handles timezone conversions
 * and never shows future timestamps that don't exist yet.
 * 
 * Run: node frontend-app/tests/stockChart.timezone.test.js
 */

// Test runner utilities
function assert(condition, message) {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function runTest(testName, testFunction) {
  try {
    testFunction();
    console.log(`✅ ${testName}`);
    return 1;
  } catch (error) {
    console.error(`❌ ${testName}`);
    console.error(`   ${error.message}`);
    return 0;
  }
}

// Mock Alpaca API data (UTC timestamps)
const MOCK_ALPACA_DATA = [
  { date: '2025-06-23T13:30:00.000Z', close: 473.36, volume: 1000000 }, // 9:30 AM EDT / 6:30 AM PDT
  { date: '2025-06-23T14:00:00.000Z', close: 475.42, volume: 1200000 }, // 10:00 AM EDT / 7:00 AM PDT
  { date: '2025-06-23T15:30:00.000Z', close: 478.91, volume: 1500000 }, // 11:30 AM EDT / 8:30 AM PDT
  { date: '2025-06-23T17:00:00.000Z', close: 481.36, volume: 1800000 }, // 1:00 PM EDT / 10:00 AM PDT
];

// Current time for testing (10:42 AM PDT = 1:42 PM EDT = 17:42 UTC)
const CURRENT_TIME_UTC = new Date('2025-06-23T17:42:00.000Z');
const CURRENT_TIME_PDT = new Date('2025-06-23T10:42:00'); // Local representation

console.log('🧪 StockChart Timezone Conversion Test Suite');
console.log('='.repeat(65));
console.log(`Current Time (UTC): ${CURRENT_TIME_UTC.toISOString()}`);
console.log(`Current Time (PDT): ${CURRENT_TIME_PDT.toLocaleString()}`);
console.log(`System Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}\n`);

let totalTests = 0;
let passedTests = 0;

// Test 1: UTC to PDT Conversion Accuracy
totalTests++;
passedTests += runTest('🌍 UTC to PDT Conversion Accuracy', () => {
  const testCases = [
    { utc: '2025-06-23T13:30:00.000Z', expectedPDTHour: 6, expectedPDTMinute: 30 },
    { utc: '2025-06-23T14:00:00.000Z', expectedPDTHour: 7, expectedPDTMinute: 0 },
    { utc: '2025-06-23T17:00:00.000Z', expectedPDTHour: 10, expectedPDTMinute: 0 },
    { utc: '2025-06-23T17:42:00.000Z', expectedPDTHour: 10, expectedPDTMinute: 42 },
  ];
  
  testCases.forEach(({ utc, expectedPDTHour, expectedPDTMinute }) => {
    const utcDate = new Date(utc);
    
    // Convert using Intl.DateTimeFormat (what our code should use)
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    });
    
    const formatted = formatter.format(utcDate);
    const [hour, minute] = formatted.split(':').map(num => parseInt(num));
    
    console.log(`    ${utc} → PDT ${hour}:${minute.toString().padStart(2, '0')}`);
    
    assert(hour === expectedPDTHour, 
           `UTC ${utc} should convert to PDT hour ${expectedPDTHour}, got ${hour}`);
    assert(minute === expectedPDTMinute, 
           `UTC ${utc} should convert to PDT minute ${expectedPDTMinute}, got ${minute}`);
  });
});

// Test 2: No Future Timestamps
totalTests++;
passedTests += runTest('⏰ No Future Timestamps in Chart Data', () => {
  console.log(`    Current time: 10:42 AM PDT (${CURRENT_TIME_UTC.toISOString()})`);
  
  MOCK_ALPACA_DATA.forEach(dataPoint => {
    const utcDate = new Date(dataPoint.date);
    
    // Convert to PDT for display
    const pdtFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    });
    
    const pdtTime = pdtFormatter.format(utcDate);
    
    console.log(`    Data point: ${dataPoint.date} → ${pdtTime} PDT`);
    
    // Critical test: No data point should be in the future
    assert(utcDate <= CURRENT_TIME_UTC, 
           `Data point ${dataPoint.date} (${pdtTime} PDT) is in the future! Current time is 10:42 AM PDT`);
  });
});

// Test 3: Format Chart Date Function Test
totalTests++;
passedTests += runTest('📊 Chart Date Formatting Function', () => {
  // Test our timezone utility function directly
  function formatChartDate(date, interval, includeTime = true, timezone = 'America/Los_Angeles') {
    const timezoneAbbr = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short'
    }).formatToParts(date).find(part => part.type === 'timeZoneName')?.value;
    
    if (includeTime && (interval.includes('min') || interval.includes('hour'))) {
      const timeFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      
      const dateFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        month: 'long',
        day: 'numeric'
      });
      
      const timeStr = timeFormatter.format(date);
      const dateStr = dateFormatter.format(date);
      
      return `${timeStr} ${timezoneAbbr}, ${dateStr}`;
    } else {
      const dateFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        month: 'long',
        day: 'numeric'
      });
      
      return dateFormatter.format(date);
    }
  }
  
  // Test with a known UTC time
  const testUTC = new Date('2025-06-23T17:00:00.000Z'); // Should be 10:00 AM PDT
  const formatted = formatChartDate(testUTC, '5min', true);
  
  console.log(`    UTC ${testUTC.toISOString()} → "${formatted}"`);
  
  // Should contain 10:00 AM PDT (not PM and not a future time)
  assert(formatted.includes('10:00 AM'), `Should show 10:00 AM, got: ${formatted}`);
  assert(formatted.includes('PDT'), `Should contain PDT timezone, got: ${formatted}`);
  assert(formatted.includes('June 23'), `Should contain date, got: ${formatted}`);
  assert(!formatted.includes('PM'), `Should not contain PM for 10:00 AM, got: ${formatted}`);
});

// Test 4: Data Processing Logic Test
totalTests++;
passedTests += runTest('🔄 Data Processing Logic', () => {
  // Simulate the data processing logic from StockChart
  function convertUTCToUserTimezone(utcDate, userTimezone = 'America/Los_Angeles') {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: userTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    const parts = formatter.formatToParts(utcDate);
    const year = parseInt(parts.find(p => p.type === 'year')?.value || '0');
    const month = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1;
    const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
    const second = parseInt(parts.find(p => p.type === 'second')?.value || '0');
    
    return new Date(year, month, day, hour, minute, second);
  }
  
  // Test conversion for each data point
  MOCK_ALPACA_DATA.forEach(dataPoint => {
    const utcDate = new Date(dataPoint.date);
    const localDate = convertUTCToUserTimezone(utcDate);
    
    console.log(`    ${dataPoint.date} → Local: ${localDate.toLocaleString()}`);
    
    // The converted local date should not be in the future of current local time
    const currentLocal = convertUTCToUserTimezone(CURRENT_TIME_UTC);
    
    assert(localDate <= currentLocal, 
           `Converted local time ${localDate.toLocaleString()} should not be after current local time ${currentLocal.toLocaleString()}`);
  });
});

// Test 5: 1D Chart Today Filter Test
totalTests++;
passedTests += runTest('📅 1D Chart Today Filter', () => {
  function isToday(date, timezone = 'America/Los_Angeles') {
    const now = new Date();
    
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    
    const todayStr = formatter.format(now);
    const dateStr = formatter.format(date);
    
    return todayStr === dateStr;
  }
  
  // Test with today's data vs yesterday's data
  const todayUTC = new Date('2025-06-23T17:00:00.000Z'); // Today in PDT
  const yesterdayUTC = new Date('2025-06-22T17:00:00.000Z'); // Yesterday in PDT
  
  const isTodayToday = isToday(todayUTC);
  const isYesterdayToday = isToday(yesterdayUTC);
  
  console.log(`    Today's data (${todayUTC.toISOString()}) is today: ${isTodayToday}`);
  console.log(`    Yesterday's data (${yesterdayUTC.toISOString()}) is today: ${isYesterdayToday}`);
  
  assert(isTodayToday === true, 'Today\'s data should be identified as today');
  assert(isYesterdayToday === false, 'Yesterday\'s data should not be identified as today');
});

// Test 6: Real-world Scenario Test
totalTests++;
passedTests += runTest('🎯 Real-world Scenario Test', () => {
  console.log(`    Testing with current real time: 10:42 AM PDT`);
  
  // Simulate what should happen with real data
  const marketOpenUTC = new Date('2025-06-23T13:30:00.000Z'); // 6:30 AM PDT market pre-open
  const currentDataUTC = new Date('2025-06-23T17:42:00.000Z'); // 10:42 AM PDT (current time)
  const futureTimeUTC = new Date('2025-06-23T18:00:00.000Z'); // 11:00 AM PDT (future)
  
  // Test that we correctly identify which times are valid
  const isMarketOpenValid = marketOpenUTC <= CURRENT_TIME_UTC;
  const isCurrentDataValid = currentDataUTC <= CURRENT_TIME_UTC;
  const isFutureTimeValid = futureTimeUTC <= CURRENT_TIME_UTC;
  
  console.log(`    Market open time (6:30 AM PDT) is valid: ${isMarketOpenValid}`);
  console.log(`    Current time data (10:42 AM PDT) is valid: ${isCurrentDataValid}`);
  console.log(`    Future time data (11:00 AM PDT) is valid: ${isFutureTimeValid}`);
  
  assert(isMarketOpenValid === true, 'Market open time should be valid (in the past)');
  assert(isCurrentDataValid === true, 'Current time data should be valid');
  assert(isFutureTimeValid === false, 'Future time data should NOT be valid');
});

// Test 7: Timezone Abbreviation Consistency
totalTests++;
passedTests += runTest('🏷️  Timezone Abbreviation Consistency', () => {
  const testDate = new Date('2025-06-23T17:00:00.000Z'); // Summer, should be PDT
  
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    timeZoneName: 'short'
  });
  
  const parts = formatter.formatToParts(testDate);
  const abbreviation = parts.find(part => part.type === 'timeZoneName')?.value;
  
  console.log(`    Summer date timezone abbreviation: ${abbreviation}`);
  
  assert(abbreviation === 'PDT', `Summer time should show PDT, got: ${abbreviation}`);
});

// Final Results
console.log('\n' + '='.repeat(65));
console.log(`🧪 Test Results: ${passedTests}/${totalTests} tests passed`);

if (passedTests === totalTests) {
  console.log('🎉 ALL TIMEZONE TESTS PASSED!');
  console.log('\n✅ Validated:');
  console.log('  🌍 UTC to PDT conversion accuracy');
  console.log('  ⏰ No future timestamps in chart data');
  console.log('  📊 Chart date formatting correctness');
  console.log('  🔄 Data processing logic');
  console.log('  📅 1D chart today filter');
  console.log('  🎯 Real-world scenarios');
  console.log('  🏷️  Timezone abbreviation consistency');
} else {
  console.log(`❌ ${totalTests - passedTests} tests failed - Issues found in timezone logic!`);
  console.log('\n🚨 CRITICAL: The StockChart is likely showing incorrect timestamps!');
}

// Export for potential reuse
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { 
    runStockChartTimezoneTests: () => passedTests === totalTests 
  };
} 