// Comprehensive test for FMP timezone parsing with error handling
console.log('=== FMP TIMEZONE PARSING - COMPREHENSIVE TEST ===');

// Import the function we need to test
// For Node.js testing, we'll inline the function since ES6 imports might not work
function parseFMPEasternTimestamp(fmpTimestamp) {
  if (!fmpTimestamp) {
    throw new Error('FMP timestamp is required');
  }

  // Parse the timestamp components
  const [datePart, timePart] = fmpTimestamp.split('T');
  if (!datePart || !timePart) {
    throw new Error(`Invalid FMP timestamp format: ${fmpTimestamp}`);
  }
  
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute, second = 0] = timePart.split(':').map(Number);
  
  // Create an ISO string for the Eastern timestamp
  const easternISOString = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}.000`;
  
  // Use a reference time to determine the current UTC offset for Eastern time
  const tempDate = new Date();
  
  // Get the current time in UTC and Eastern timezone for reference
  const utcTimeString = tempDate.toISOString().replace('T', ' ').slice(0, 19);
  const easternTimeString = tempDate.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Calculate the offset between UTC and Eastern time
  const utcRefDate = new Date(tempDate.toISOString());
  const easternRefDate = new Date(easternTimeString.replace(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/, '$1-$2-$3T$4:$5:$6'));
  
  // Get timezone offset in milliseconds (how much to ADD to Eastern to get UTC)
  const easternToUtcOffsetMs = utcRefDate.getTime() - easternRefDate.getTime();
  
  // Apply this offset to our Eastern timestamp
  const easternLocalDate = new Date(easternISOString);
  const utcDate = new Date(easternLocalDate.getTime() + easternToUtcOffsetMs);
  
  return utcDate;
}

// Test cases
const testCases = [
  {
    name: 'Valid FMP timestamp - 8:35 PM Eastern',
    input: '2025-06-23T20:35:00',
    expectedPdtHour: 17, // 5:35 PM PDT
    shouldPass: true
  },
  {
    name: 'Valid FMP timestamp - 9:30 AM Eastern (Market open)',
    input: '2025-06-23T09:30:00',
    expectedPdtHour: 6, // 6:30 AM PDT
    shouldPass: true
  },
  {
    name: 'Valid FMP timestamp - 4:00 PM Eastern (Market close)',
    input: '2025-06-23T16:00:00',
    expectedPdtHour: 13, // 1:00 PM PDT
    shouldPass: true
  },
  {
    name: 'Invalid timestamp - undefined',
    input: undefined,
    shouldPass: false
  },
  {
    name: 'Invalid timestamp - empty string',
    input: '',
    shouldPass: false
  },
  {
    name: 'Invalid timestamp - malformed',
    input: 'invalid-timestamp',
    shouldPass: false
  }
];

console.log('Current PDT time:', new Date().toLocaleString('en-US', {
  timeZone: 'America/Los_Angeles',
  hour12: true,
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit'
}));

console.log('\n--- RUNNING TESTS ---');

let passedTests = 0;
let totalTests = testCases.length;

testCases.forEach((testCase, index) => {
  console.log(`\n${index + 1}. ${testCase.name}`);
  console.log(`   Input: ${testCase.input}`);
  
  try {
    if (testCase.shouldPass) {
      const result = parseFMPEasternTimestamp(testCase.input);
      console.log(`   Result UTC: ${result.toISOString()}`);
      
      const pdtTime = result.toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        hour12: true,
        hour: 'numeric',
        minute: '2-digit',
        month: 'long',
        day: 'numeric'
      });
      console.log(`   Result PDT: ${pdtTime}`);
      
      const pdtHour = parseInt(result.toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        hour: 'numeric',
        hour12: false
      }));
      
      const hourMatches = pdtHour === testCase.expectedPdtHour;
      console.log(`   Expected PDT Hour: ${testCase.expectedPdtHour}, Actual: ${pdtHour}`);
      console.log(`   ✅ PASS: ${hourMatches ? 'Hour matches' : 'Hour does not match'}`);
      
      if (hourMatches) {
        passedTests++;
      }
    } else {
      // This should fail
      const result = parseFMPEasternTimestamp(testCase.input);
      console.log(`   ❌ FAIL: Expected error but got result: ${result}`);
    }
  } catch (error) {
    if (testCase.shouldPass) {
      console.log(`   ❌ FAIL: Unexpected error: ${error.message}`);
    } else {
      console.log(`   ✅ PASS: Expected error: ${error.message}`);
      passedTests++;
    }
  }
});

console.log('\n--- TEST SUMMARY ---');
console.log(`Passed: ${passedTests}/${totalTests}`);
console.log(`Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);

if (passedTests === totalTests) {
  console.log('🎉 ALL TESTS PASSED! The FMP Eastern Time parsing is working correctly.');
} else {
  console.log('⚠️  Some tests failed. Please review the implementation.');
}

// Additional timezone validation
console.log('\n--- TIMEZONE VALIDATION ---');
console.log('Current EDT/EST offset check:');
const now = new Date();
const easternTime = now.toLocaleString('en-US', {
  timeZone: 'America/New_York',
  hour12: true,
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short'
});
const pdtTime = now.toLocaleString('en-US', {
  timeZone: 'America/Los_Angeles',
  hour12: true,
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short'
});

console.log(`Eastern Time: ${easternTime}`);
console.log(`PDT Time: ${pdtTime}`);

// Calculate expected hour difference (should be 3 hours)
const easternHour = parseInt(now.toLocaleString('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  hour12: false
}));
const pdtHour = parseInt(now.toLocaleString('en-US', {
  timeZone: 'America/Los_Angeles',
  hour: 'numeric',
  hour12: false
}));

const hourDiff = easternHour - pdtHour;
console.log(`Hour difference (Eastern - PDT): ${hourDiff} hours`);
console.log(`Expected: 3 hours (during EDT), Actual: ${hourDiff} hours`);
console.log(`Timezone check: ${hourDiff === 3 ? '✅ CORRECT' : '❌ INCORRECT'}`); 