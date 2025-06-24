// Comprehensive test for FMP timestamp parsing and timezone conversion
// This test will validate the correct approach to handle FMP Eastern Time data

console.log('=== CRITICAL TIMEZONE CONVERSION TEST ===');
console.log('Current time:', new Date().toISOString());
console.log('Current PDT time:', new Date().toLocaleString('en-US', { 
  timeZone: 'America/Los_Angeles',
  hour12: true, 
  month: 'long', 
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit'
}));

// Test 1: Understand how FMP timestamps work
console.log('\n--- TEST 1: FMP Timestamp Analysis ---');

// Simulated FMP timestamp (what they actually return)
const fmpTimestamp = '2025-01-23T20:35:00'; // This is 8:35 PM Eastern Time

console.log('FMP timestamp (Eastern Time):', fmpTimestamp);

// Method 1: Current broken approach - treating as UTC
const wrongUtcDate = new Date(fmpTimestamp + 'Z'); // Force UTC interpretation
console.log('WRONG: Treating as UTC:', wrongUtcDate.toISOString());
console.log('WRONG: In PDT:', wrongUtcDate.toLocaleString('en-US', { 
  timeZone: 'America/Los_Angeles',
  hour12: true, 
  hour: 'numeric',
  minute: '2-digit'
}));

// Method 2: Correct approach - parse as Eastern Time
console.log('\n--- TEST 2: Correct Eastern Time Parsing ---');

// Create date in Eastern timezone
const easternDate = new Date(fmpTimestamp); // Parse without timezone specifier
console.log('Parsed date (browser local):', easternDate.toISOString());

// Get what time this represents in Eastern timezone
const easternTimeString = easternDate.toLocaleString('en-US', {
  timeZone: 'America/New_York',
  hour12: true,
  hour: 'numeric',
  minute: '2-digit',
  month: 'long',
  day: 'numeric'
});
console.log('As Eastern Time:', easternTimeString);

// Get what time this represents in PDT
const pdtTimeString = easternDate.toLocaleString('en-US', {
  timeZone: 'America/Los_Angeles', 
  hour12: true,
  hour: 'numeric',
  minute: '2-digit',
  month: 'long',
  day: 'numeric'
});
console.log('As PDT:', pdtTimeString);

// Test 3: Correct timezone offset calculation
console.log('\n--- TEST 3: Correct Timezone Offset Calculation ---');

function getCorrectTimezoneOffset(date, timezone) {
  // Use Intl.DateTimeFormat to get the correct offset
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    timeZoneName: 'longOffset'
  });
  
  const parts = formatter.formatToParts(date);
  const offsetPart = parts.find(part => part.type === 'timeZoneName');
  
  if (offsetPart && offsetPart.value.match(/GMT([+-]\d{1,2}):?(\d{2})?/)) {
    const match = offsetPart.value.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
    const sign = match[1] === '+' ? 1 : -1;
    const hours = parseInt(match[2]);
    const minutes = match[3] ? parseInt(match[3]) : 0;
    return sign * (hours * 60 + minutes);
  }
  
  return 0;
}

const testDate = new Date();
const easternOffset = getCorrectTimezoneOffset(testDate, 'America/New_York');
const pdtOffset = getCorrectTimezoneOffset(testDate, 'America/Los_Angeles');

console.log('Eastern offset (minutes from GMT):', easternOffset);
console.log('PDT offset (minutes from GMT):', pdtOffset);
console.log('Difference (Eastern to PDT):', easternOffset - pdtOffset, 'minutes');

// Test 4: Proposed correct FMP parsing
console.log('\n--- TEST 4: Correct FMP Parsing Algorithm ---');

function parseEasternTimeToUserTimezone(fmpTimestamp, userTimezone = 'America/Los_Angeles') {
  // Step 1: FMP timestamp is in Eastern Time
  // Create a date that represents the SAME local time in Eastern timezone
  
  // Parse the timestamp components
  const [datePart, timePart] = fmpTimestamp.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute, second = 0] = timePart.split(':').map(Number);
  
  // Create a date in Eastern timezone by using the browser's interpretation
  // but then adjusting for the difference between browser timezone and Eastern
  const localDate = new Date(year, month - 1, day, hour, minute, second);
  
  // Find what this local date would be if it were in Eastern timezone
  const easternFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit', 
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Get current time as reference point
  const now = new Date();
  const easternNowString = easternFormatter.format(now);
  const localNowString = now.getFullYear() + '-' + 
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + ' ' +
    String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0') + ':' +
    String(now.getSeconds()).padStart(2, '0');
  
  console.log('Reference comparison:');
  console.log('  Local browser time:', localNowString);
  console.log('  Same moment in Eastern:', easternNowString);
  
  // Calculate the offset between local and Eastern
  const localNow = new Date();
  const easternNow = new Date(easternNowString.replace(' ', 'T'));
  const offsetMs = localNow.getTime() - easternNow.getTime();
  
  console.log('  Calculated offset (ms):', offsetMs);
  console.log('  Calculated offset (hours):', offsetMs / (1000 * 60 * 60));
  
  // Apply this offset to our FMP timestamp  
  const adjustedDate = new Date(localDate.getTime() + offsetMs);
  
  return adjustedDate;
}

const correctedDate = parseEasternTimeToUserTimezone(fmpTimestamp);
console.log('Corrected date:', correctedDate.toISOString());
console.log('In PDT:', correctedDate.toLocaleString('en-US', {
  timeZone: 'America/Los_Angeles',
  hour12: true,
  hour: 'numeric', 
  minute: '2-digit',
  month: 'long',
  day: 'numeric'
}));

// Test 5: Final validation
console.log('\n--- TEST 5: Final Validation ---');
console.log('EXPECTED: If FMP says 8:35 PM Eastern, it should show as 5:35 PM PDT');
console.log('ACTUAL RESULT:', correctedDate.toLocaleString('en-US', {
  timeZone: 'America/Los_Angeles',
  hour12: true,
  hour: 'numeric',
  minute: '2-digit'
}));

const expectedPdtHour = 17; // 5 PM
const actualPdtHour = parseInt(correctedDate.toLocaleString('en-US', {
  timeZone: 'America/Los_Angeles',
  hour: 'numeric',
  hour12: false
}));

console.log('SUCCESS:', actualPdtHour === expectedPdtHour ? '✅' : '❌');
console.log('Expected PDT hour:', expectedPdtHour);
console.log('Actual PDT hour:', actualPdtHour); 