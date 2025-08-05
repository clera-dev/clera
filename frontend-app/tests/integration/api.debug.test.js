/**
 * API Debug Test for StockChart Data
 * 
 * Tests to understand what data the FMP API is returning and why
 * we're seeing future timestamps
 * 
 * Run: node frontend-app/tests/api.debug.test.js
 */

console.log('🔍 API Debug Test - Investigating Future Timestamps');
console.log('='.repeat(60));

// Simulate the StockChart date range logic
function calculateDateRange() {
  const now = new Date();
  console.log(`Current time: ${now.toISOString()} (${now.toLocaleString()})`);
  
  // For 1D chart - this is what StockChart does
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0); // Start of today in local time
  
  const fromDate = startOfToday;
  const toDate = now;
  
  const fromStr = fromDate.toISOString().split('T')[0];
  const toStr = toDate.toISOString().split('T')[0];
  
  console.log('\n📅 Date Range Calculation:');
  console.log(`From: ${fromDate.toISOString()} (${fromStr})`);
  console.log(`To: ${toDate.toISOString()} (${toStr})`);
  
  return { fromStr, toStr, fromDate, toDate };
}

// Test what the API would return
async function testFmpApi() {
  const { fromStr, toStr } = calculateDateRange();
  
  // Mock what the StockChart component would send
  const testSymbol = 'AAPL';
  const testInterval = '5min';
  
  console.log('\n🌐 API Request Simulation:');
  console.log(`Symbol: ${testSymbol}`);
  console.log(`Interval: ${testInterval}`);
  console.log(`Date Range: ${fromStr} to ${toStr}`);
  
  // We can't actually make the API call without the key, but let's simulate what would happen
  const mockFmpUrl = `https://financialmodelingprep.com/stable/historical-chart/${testInterval}?symbol=${testSymbol}&from=${fromStr}&to=${toStr}&apikey=[REDACTED]`;
  console.log(`FMP URL: ${mockFmpUrl}`);
  
  // Mock response that could explain the issue
  const mockApiResponse = [
    { date: '2025-06-23T13:30:00Z', close: 473.36, volume: 1000000 }, // 6:30 AM PDT ✓ Valid
    { date: '2025-06-23T14:00:00Z', close: 475.42, volume: 1200000 }, // 7:00 AM PDT ✓ Valid
    { date: '2025-06-23T17:00:00Z', close: 481.36, volume: 1800000 }, // 10:00 AM PDT ✓ Valid
    { date: '2025-06-23T20:35:00Z', close: 487.00, volume: 2000000 }, // 1:35 PM PDT ❌ FUTURE!
  ];
  
  console.log('\n📊 Mock API Response Analysis:');
  const currentTime = new Date();
  
  mockApiResponse.forEach((dataPoint, index) => {
    const utcDate = new Date(dataPoint.date);
    const pdtTime = utcDate.toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      month: 'long',
      day: 'numeric'
    });
    
    const isFuture = utcDate > currentTime;
    const status = isFuture ? '❌ FUTURE' : '✅ Valid';
    
    console.log(`  ${index + 1}. ${dataPoint.date} → ${pdtTime} PDT ${status}`);
    
    if (isFuture) {
      const minutesInFuture = Math.round((utcDate.getTime() - currentTime.getTime()) / (1000 * 60));
      console.log(`     This is ${minutesInFuture} minutes in the future!`);
    }
  });
}

// Test the today filter logic
function testTodayFilter() {
  console.log('\n🗓️  Today Filter Logic Test:');
  
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
  
  const testDates = [
    '2025-06-23T13:30:00Z', // Should be today
    '2025-06-23T20:35:00Z', // Should be today (even if future)
    '2025-06-22T20:00:00Z', // Should be yesterday
    '2025-06-24T14:00:00Z', // Should be tomorrow
  ];
  
  testDates.forEach(dateString => {
    const date = new Date(dateString);
    const isValidToday = isToday(date);
    const pdtTime = date.toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      month: 'long',
      day: 'numeric'
    });
    
    console.log(`  ${dateString} → ${pdtTime} PDT → Today: ${isValidToday}`);
  });
}

// Check market hours logic
function testMarketHours() {
  console.log('\n🏢 Market Hours Analysis:');
  
  const now = new Date();
  const currentHourPDT = parseInt(now.toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: '2-digit',
    hour12: false
  }));
  
  console.log(`Current hour in PDT: ${currentHourPDT}:${now.getMinutes().toString().padStart(2, '0')}`);
  
  // US Market hours in PDT: 6:30 AM - 1:00 PM (regular hours)
  // Pre-market: 4:00 AM - 6:30 AM
  // After-market: 1:00 PM - 5:00 PM
  
  if (currentHourPDT < 4) {
    console.log('⏰ Currently: Pre-pre-market (should have no data)');
  } else if (currentHourPDT < 6 || (currentHourPDT === 6 && now.getMinutes() < 30)) {
    console.log('🌅 Currently: Pre-market hours (6:30 AM)');
  } else if (currentHourPDT < 13) {
    console.log('📈 Currently: Regular market hours (6:30 AM - 1:00 PM PDT)');
  } else if (currentHourPDT < 17) {
    console.log('🌆 Currently: After-market hours (1:00 PM - 5:00 PM PDT)');
  } else {
    console.log('🌙 Currently: Market closed');
  }
  
  // The issue: if it's 10:42 AM PDT, market is open
  // But chart shows 1:35 PM PDT = future data!
  if (currentHourPDT === 10) {
    console.log('\n🚨 ISSUE IDENTIFIED:');
    console.log('   Current time: 10:42 AM PDT (market is open)');
    console.log('   Chart showing: 1:35 PM PDT (future!)');
    console.log('   Problem: API returning future data or timezone conversion bug');
  }
}

// Root cause analysis
function analyzeRootCause() {
  console.log('\n🔬 Root Cause Analysis:');
  console.log('');
  console.log('POSSIBLE CAUSES:');
  console.log('1. FMP API returning future data (API issue)');
  console.log('2. Date range calculation sending wrong dates to API');
  console.log('3. Timezone conversion creating wrong timestamps');
  console.log('4. Chart processing not filtering future data');
  console.log('5. Cache returning stale/wrong data');
  console.log('');
  console.log('SOLUTION APPROACH:');
  console.log('1. Add strict future-time filtering in StockChart');
  console.log('2. Log actual API responses in development');
  console.log('3. Validate date ranges before API calls');
  console.log('4. Clear cache if returning invalid data');
}

// Run all tests
console.log(`Test started at: ${new Date().toISOString()}`);
console.log(`System timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}\n`);

calculateDateRange();
testFmpApi();
testTodayFilter();
testMarketHours();
analyzeRootCause();

console.log('\n' + '='.repeat(60));
console.log('🎯 NEXT STEPS:');
console.log('1. Add future-time filtering to StockChart');
console.log('2. Add API response logging');
console.log('3. Test with real API to confirm issue source'); 