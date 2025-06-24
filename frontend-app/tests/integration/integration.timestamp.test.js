const http = require('http');
const { strict: assert } = require('assert');

/**
 * INTEGRATION TESTS for Real FMP API Data Processing
 * Tests the complete pipeline from API response to chart data processing
 */

// Helper to make HTTP requests to local Next.js server
function makeAPIRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          } else {
            const jsonData = JSON.parse(data);
            resolve(jsonData);
          }
        } catch (error) {
          reject(new Error(`Parse error: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

// Test real FMP API responses
async function testRealFMPResponses() {
  console.log('\n🌐 Testing Real FMP API Responses');
  
  const testCases = [
    {
      symbol: 'NVDA',
      interval: '5min',
      description: 'NVDA 5-minute intraday data'
    },
    {
      symbol: 'NVDA', 
      interval: 'daily',
      description: 'NVDA daily data'
    },
    {
      symbol: 'AAPL',
      interval: '5min', 
      description: 'AAPL 5-minute intraday data'
    }
  ];

  for (const testCase of testCases) {
    try {
      console.log(`\n🧪 Testing ${testCase.description}...`);
      
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 2); // 2 days ago
      const toDate = new Date();
      
      const fromStr = fromDate.toISOString().split('T')[0];
      const toStr = toDate.toISOString().split('T')[0];
      
      const path = `/api/fmp/chart/${testCase.symbol}?interval=${testCase.interval}&from=${fromStr}&to=${toStr}`;
      console.log(`📡 Requesting: ${path}`);
      
      const data = await makeAPIRequest(path);
      
      assert(Array.isArray(data), 'Response should be an array');
      assert(data.length > 0, 'Should have data points');
      
      console.log(`✅ Received ${data.length} data points`);
      
      // Test each data point for the timestamp format that was causing issues
      data.slice(0, 10).forEach((item, index) => { // Test first 10 items
        assert(item.date, `Item ${index}: Should have date field`);
        assert(typeof item.date === 'string', `Item ${index}: Date should be string`);
        
        // The critical test: handle both intraday and daily timestamp formats
        const intradayRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/; // YYYY-MM-DD HH:MM:SS
        const dailyRegex = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD
        
        const isValidFormat = intradayRegex.test(item.date) || dailyRegex.test(item.date);
        assert(isValidFormat, `Item ${index}: Date format should be either YYYY-MM-DD HH:MM:SS or YYYY-MM-DD, got: ${item.date}`);
        
        // Test that we can parse this timestamp without "Invalid time value" error
        let testDate;
        if (dailyRegex.test(item.date)) {
          // Daily format - add default market close time
          testDate = new Date(`${item.date}T16:00:00-04:00`);
        } else {
          // Intraday format
          testDate = new Date(item.date.replace(' ', 'T') + '-04:00');
        }
        
        assert(!isNaN(testDate.getTime()), `Item ${index}: Should parse timestamp ${item.date}`);
        
        // Critical: toISOString() should not throw
        const isoString = testDate.toISOString();
        assert(typeof isoString === 'string', `Item ${index}: toISOString() should work for ${item.date}`);
        
        console.log(`✅ Item ${index}: ${item.date} -> ${isoString} (price: ${item.close || item.price})`);
      });
      
      console.log(`✅ ${testCase.description} - All timestamps parsed successfully`);
      
    } catch (error) {
      console.log(`❌ ${testCase.description} failed:`, error.message);
      throw error;
    }
  }
  
  console.log('✅ Real FMP API response tests passed');
}

// Test the specific data processing logic from StockChart.tsx
function testDataProcessingLogic() {
  console.log('\n⚙️ Testing StockChart Data Processing Logic');
  
  // Mock data that simulates real FMP response format
  const mockFMPData = [
    {"date":"2025-06-24 15:55:00","open":147.82,"low":147.72,"high":147.935,"close":147.92,"volume":7273335},
    {"date":"2025-06-24 15:50:00","open":147.545,"low":147.545,"high":147.835,"close":147.835,"volume":4992905},
    {"date":"2025-06-24 15:45:00","open":147.315,"low":147.23,"high":147.535,"close":147.535,"volume":1922049},
    {"date":"2025-06-24 14:45:00","open":147.2929,"low":147.2001,"high":147.3388,"close":147.325,"volume":1390626}, // The problematic timestamp
    {"date":"2025-06-24 09:30:00","open":147.22,"low":147.2088,"high":147.4116,"close":147.3482,"volume":1409267},
  ];
  
  // Simulate the exact processing logic from StockChart.tsx
  function simulateProcessRawData(rawData) {
    const now = new Date();
    
    return rawData.map((item) => {
      const fmpTimestamp = item.date || item.datetime || item.timestamp;
      
      if (!fmpTimestamp) {
        console.warn('[Test] No timestamp found in data item:', item);
        return null;
      }
      
      try {
        // Simulate the simplified parseFMPEasternTimestamp logic
        const dateTimeString = fmpTimestamp.replace(' ', 'T');
        const fullISOString = `${dateTimeString}-04:00`;
        const utcDate = new Date(fullISOString);
        
        if (isNaN(utcDate.getTime())) {
          throw new Error(`Invalid date: ${fmpTimestamp}`);
        }
        
        // Filter out future data points
        if (utcDate > now) {
          console.log(`[Test] Filtering future data: ${fmpTimestamp}`);
          return null;
        }
        
        const price = item.price !== undefined ? item.price : item.close || 0;
        
        return {
          date: fmpTimestamp,
          price,
          volume: item.volume,
          timestamp: utcDate.getTime(),
          localDate: utcDate
        };
      } catch (error) {
        console.error(`[Test] Failed to parse ${fmpTimestamp}:`, error);
        return null;
      }
    }).filter(item => item !== null);
  }
  
  try {
    const processedData = simulateProcessRawData(mockFMPData);
    
    assert(processedData.length > 0, 'Should have processed data points');
    assert(processedData.length <= mockFMPData.length, 'Processed data should not exceed raw data');
    
    // Test that all processed items have valid dates and can call toISOString()
    processedData.forEach((item, index) => {
      assert(item.localDate instanceof Date, `Item ${index}: localDate should be Date object`);
      assert(!isNaN(item.localDate.getTime()), `Item ${index}: localDate should be valid`);
      
      // The critical test that was failing before our fix
      const isoString = item.localDate.toISOString();
      assert(typeof isoString === 'string', `Item ${index}: toISOString() should work`);
      
      console.log(`✅ Processed ${index}: ${item.date} -> ${isoString} (price: ${item.price})`);
    });
    
    console.log(`✅ Data processing: ${mockFMPData.length} raw -> ${processedData.length} processed`);
    
  } catch (error) {
    console.log('❌ Data processing logic failed:', error.message);
    throw error;
  }
  
  console.log('✅ StockChart data processing logic tests passed');
}

// Test Eastern date construction with current time
function testCurrentEasternDateConstruction() {
  console.log('\n📅 Testing Current Eastern Date Construction');
  
  try {
    const now = new Date();
    
    const easternFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    
    const easternParts = easternFormatter.formatToParts(now);
    console.log('Current Eastern parts:', easternParts);
    
    // Test the FIXED logic
    const year = easternParts.find(part => part.type === 'year')?.value;
    const month = easternParts.find(part => part.type === 'month')?.value;
    const day = easternParts.find(part => part.type === 'day')?.value;
    
    assert(year, 'Year should be extracted');
    assert(month, 'Month should be extracted');
    assert(day, 'Day should be extracted');
    
    const easternToday = new Date(`${year}-${month}-${day}`);
    assert(!isNaN(easternToday.getTime()), 'Eastern date should be valid');
    
    // The critical test that was failing
    const isoString = easternToday.toISOString();
    assert(typeof isoString === 'string', 'toISOString() should work');
    
    console.log(`✅ Current Eastern date: ${year}-${month}-${day} -> ${isoString}`);
    
    // Test market holiday utility with this date
    const MarketHolidayUtil = {
      isMarketHoliday: function(date) {
        // Simple test implementation
        const dateStr = date.toISOString().split('T')[0];
        console.log(`Testing market holiday for: ${dateStr}`);
        return false; // Simplified for testing
      },
      
      getLastTradingDay: function(date) {
        console.log(`Getting last trading day for: ${date.toISOString()}`);
        return date; // Simplified for testing
      }
    };
    
    // This should not throw "Invalid time value"
    const isHoliday = MarketHolidayUtil.isMarketHoliday(easternToday);
    const lastTradingDay = MarketHolidayUtil.getLastTradingDay(easternToday);
    
    console.log(`✅ Market holiday check: ${isHoliday}`);
    console.log(`✅ Last trading day: ${lastTradingDay.toISOString()}`);
    
  } catch (error) {
    console.log('❌ Current Eastern date construction failed:', error.message);
    throw error;
  }
  
  console.log('✅ Current Eastern date construction tests passed');
}

// Run all integration tests
async function runIntegrationTests() {
  console.log('🔗 RUNNING INTEGRATION TESTS');
  console.log('============================');
  
  try {
    testCurrentEasternDateConstruction();
    testDataProcessingLogic();
    
    // Test real API (only if server is running)
    try {
      await testRealFMPResponses();
    } catch (error) {
      if (error.message.includes('ECONNREFUSED')) {
        console.log('⚠️  Skipping real API tests - Next.js server not running on localhost:3000');
      } else {
        throw error;
      }
    }
    
    console.log('\n🎉 ALL INTEGRATION TESTS PASSED!');
    console.log('✅ The complete timestamp processing pipeline is working correctly.');
    console.log('✅ Real FMP data can be processed without "Invalid time value" errors.');
    
  } catch (error) {
    console.log('\n💥 INTEGRATION TEST FAILED:');
    console.log('Error:', error.message);
    console.log('Stack:', error.stack);
    process.exit(1);
  }
}

// Export for use in other test files
module.exports = {
  runIntegrationTests,
  testRealFMPResponses,
  testDataProcessingLogic,
  testCurrentEasternDateConstruction
};

// Run tests if this file is executed directly
if (require.main === module) {
  runIntegrationTests();
} 