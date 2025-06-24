/**
 * Timezone Utility Library for Production Trading Platform
 * 
 * Handles timezone conversion between:
 * - UTC (from APIs like Alpaca)
 * - Market timezone (US/Eastern for US equities)
 * - User timezone (detected from browser)
 * 
 * Best practices from production brokerage platforms like Robinhood, Fidelity, etc.
 */

export interface TimezoneInfo {
  userTimezone: string;
  marketTimezone: string;
  userTimezoneAbbr: string;
  marketTimezoneAbbr: string;
}

/**
 * Market timezone mappings for different asset classes
 */
export const MARKET_TIMEZONES = {
  US_EQUITIES: 'America/New_York',  // NYSE, NASDAQ
  US_FUTURES: 'America/Chicago',    // CME, CBOT
  CRYPTO: 'UTC',                    // 24/7 markets
  FOREX: 'UTC',                     // 24/5 markets
} as const;

/**
 * Parse FMP timestamp (which is in Eastern Time) to a proper UTC Date object
 * FMP returns timestamps in America/New_York timezone, not UTC
 * 
 * SIMPLIFIED VERSION: More robust and less prone to errors
 */
export function parseFMPEasternTimestamp(fmpTimestamp: string): Date {
  // Add input validation to prevent undefined/null errors
  if (!fmpTimestamp || typeof fmpTimestamp !== 'string') {
    throw new Error(`Invalid timestamp: ${fmpTimestamp}`);
  }
  
  // Handle different timestamp formats
  let dateTimeString: string;
  
  if (fmpTimestamp.includes('T')) {
    // ISO format: "2025-06-23T15:55:00" -> already good
    dateTimeString = fmpTimestamp;
  } else if (fmpTimestamp.includes(' ')) {
    // Space format: "2025-06-23 15:55:00" -> convert to ISO
    dateTimeString = fmpTimestamp.replace(' ', 'T');
  } else {
    // Date-only format: "2025-06-23" -> add market close time (4:00 PM ET)
    dateTimeString = `${fmpTimestamp}T16:00:00`;
  }
  
  // Add Eastern timezone offset
  // In June, Eastern time is EDT (UTC-4), so we append -04:00
  // In winter, it would be EST (UTC-5), so we would append -05:00
  // For simplicity, we'll determine this dynamically
  const testDate = new Date();
  const easternOffset = testDate.toLocaleString('en', {
    timeZone: 'America/New_York',
    timeZoneName: 'longOffset'
  }).match(/GMT([+-]\d{2}):(\d{2})/);
  
  let offsetString = '-04:00'; // Default for EDT
  if (easternOffset) {
    const signAndHours = easternOffset[1]; // e.g., "-04"
    const minutes = easternOffset[2];      // e.g., "00"
    offsetString = `${signAndHours}:${minutes}`;
  }
  
  // Create the full ISO string with timezone
  const fullISOString = `${dateTimeString}${offsetString}`;
  
  // Create and validate the Date object
  const utcDate = new Date(fullISOString);
  
  if (isNaN(utcDate.getTime())) {
    throw new Error(`Failed to parse timestamp: ${fmpTimestamp} -> ${fullISOString}`);
  }
  
  return utcDate;
}

/**
 * Get timezone offset in minutes for a specific timezone at a given date
 * CORRECTED VERSION - the previous implementation was completely broken
 */
export function getTimezoneOffsetMinutes(date: Date, timezone: string): number {
  try {
    // Use Intl.DateTimeFormat to get the correct timezone offset
    const formatter = new Intl.DateTimeFormat('en', {
      timeZone: timezone,
      timeZoneName: 'longOffset'
    });
    
    const parts = formatter.formatToParts(date);
    const offsetPart = parts.find(part => part.type === 'timeZoneName');
    
    if (offsetPart && offsetPart.value.match(/GMT([+-]\d{2}):(\d{2})/)) {
      const match = offsetPart.value.match(/GMT([+-])(\d{2}):(\d{2})/);
      const sign = match![1] === '+' ? 1 : -1;
      const hours = parseInt(match![2]);
      const minutes = parseInt(match![3]);
      return sign * (hours * 60 + minutes);
    }
    
    // Fallback method: use the difference between local and target timezone
    const utcTime = date.getTime();
    const targetTime = new Date(date.toLocaleString('en-US', { timeZone: timezone })).getTime();
    const offsetMs = targetTime - utcTime;
    return Math.round(offsetMs / (1000 * 60));
  } catch (error) {
    console.warn(`Failed to get timezone offset for ${timezone}`, error);
    return 0;
  }
}

/**
 * Get user's browser timezone using modern Intl API
 */
export function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (error) {
    console.warn('Failed to detect user timezone, falling back to UTC', error);
    return 'UTC';
  }
}

/**
 * Get timezone abbreviation (e.g., "PDT", "EST", "UTC")
 */
export function getTimezoneAbbreviation(date: Date, timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short'
    });
    
    const parts = formatter.formatToParts(date);
    const timeZonePart = parts.find(part => part.type === 'timeZoneName');
    let abbreviation = timeZonePart?.value || timezone;
    
    // Map common GMT+X formats to more user-friendly abbreviations for production UX
    const abbreviationMap: { [key: string]: string } = {
      'GMT+9': 'JST',      // Japan Standard Time
      'GMT+10': 'AEST',    // Australian Eastern Standard Time  
      'GMT+11': 'AEDT',    // Australian Eastern Daylight Time
      'GMT+1': 'CET',      // Central European Time
      'GMT': 'GMT',        // Greenwich Mean Time
      'GMT-8': 'PST',      // Pacific Standard Time
      'GMT-7': 'PDT',      // Pacific Daylight Time
      'GMT-6': 'CST',      // Central Standard Time
      'GMT-5': 'EST',      // Eastern Standard Time (winter)
      'GMT-4': 'EDT',      // Eastern Daylight Time (summer)
    };
    
    // Check for more specific timezone mappings based on timezone name
    const timezoneMap: { [key: string]: { standard: string, daylight: string } } = {
      'Asia/Tokyo': { standard: 'JST', daylight: 'JST' },
      'Australia/Sydney': { standard: 'AEST', daylight: 'AEDT' },
      'Europe/London': { standard: 'GMT', daylight: 'BST' },
      'Europe/Paris': { standard: 'CET', daylight: 'CEST' },
    };
    
    // If we have a specific timezone mapping, use it
    if (timezoneMap[timezone]) {
      const mapping = timezoneMap[timezone];
      // Simple heuristic: if it's summer months in the northern hemisphere, use daylight time
      const month = date.getMonth(); // 0-11
      const isDSTPeriod = month >= 2 && month <= 9; // March to October (rough DST period)
      abbreviation = isDSTPeriod ? mapping.daylight : mapping.standard;
    } else if (abbreviationMap[abbreviation]) {
      // Use our mapping for GMT+X formats
      abbreviation = abbreviationMap[abbreviation];
    }
    
    return abbreviation;
  } catch (error) {
    console.warn(`Failed to get timezone abbreviation for ${timezone}`, error);
    return timezone;
  }
}

/**
 * Get comprehensive timezone information
 */
export function getTimezoneInfo(marketType: keyof typeof MARKET_TIMEZONES = 'US_EQUITIES'): TimezoneInfo {
  const userTimezone = getUserTimezone();
  const marketTimezone = MARKET_TIMEZONES[marketType];
  const now = new Date();
  
  return {
    userTimezone,
    marketTimezone,
    userTimezoneAbbr: getTimezoneAbbreviation(now, userTimezone),
    marketTimezoneAbbr: getTimezoneAbbreviation(now, marketTimezone),
  };
}

/**
 * Convert UTC date to user's timezone
 * 
 * Note: This function now returns the original UTC date unchanged.
 * Timezone conversion should only happen during formatting/display, not data processing.
 * This prevents issues with Date object manipulation and maintains data integrity.
 */
export function convertUTCToUserTimezone(utcDate: Date, userTimezone?: string): Date {
  // Keep UTC dates as-is for data integrity
  // Timezone conversion should only happen during formatting
  return utcDate;
}

/**
 * Convert UTC date to market timezone
 */
export function convertUTCToMarketTimezone(utcDate: Date, marketType: keyof typeof MARKET_TIMEZONES = 'US_EQUITIES'): Date {
  const marketTimezone = MARKET_TIMEZONES[marketType];
  return convertUTCToUserTimezone(utcDate, marketTimezone);
}

/**
 * Format date for stock chart display based on user requirements
 * Format: "9:30 AM PDT, June 23" for intraday
 *         "June 23" for daily
 */
export function formatChartDate(
  date: Date, 
  interval: string, 
  includeTime: boolean = true,
  timezone?: string
): string {
  const targetTimezone = timezone || getUserTimezone();
  const timezoneAbbr = getTimezoneAbbreviation(date, targetTimezone);
  
  try {
    if (includeTime && (interval.includes('min') || interval.includes('hour'))) {
      // For intraday: "9:30 AM PDT, June 23"
      const timeFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: targetTimezone,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      
      const dateFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: targetTimezone,
        month: 'long',
        day: 'numeric'
      });
      
      const timeStr = timeFormatter.format(date);
      const dateStr = dateFormatter.format(date);
      
      return `${timeStr} ${timezoneAbbr}, ${dateStr}`;
    } else {
      // For daily: "June 23"
      const dateFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: targetTimezone,
        month: 'long',
        day: 'numeric'
      });
      
      return dateFormatter.format(date);
    }
  } catch (error) {
    console.warn('Failed to format chart date, falling back to simple format', error);
    return date.toLocaleDateString();
  }
}

/**
 * Get the start of today in user's timezone
 * This is crucial for 1D charts to only show TODAY's data
 */
export function getStartOfTodayInUserTimezone(timezone?: string): Date {
  const targetTimezone = timezone || getUserTimezone();
  const now = new Date();
  
  try {
    // Get today's date in the target timezone
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: targetTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    
    const todayStr = formatter.format(now);
    const [year, month, day] = todayStr.split('-').map(num => parseInt(num));
    
    // The key insight: We need to find what UTC time corresponds to midnight in the target timezone
    // We'll use a more reliable method by creating a date string and parsing it correctly
    
    // Create midnight today in target timezone using temporal API approach
    // First, let's see what UTC time shows as "today" in the target timezone
    let testDate = new Date(`${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T00:00:00.000Z`);
    
    // Check what day this UTC time represents in the target timezone
    const testFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: targetTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    
    const testDayStr = testFormatter.format(testDate);
    
    // If the test date doesn't show as the correct day in target timezone, we need to adjust
    let adjustmentHours = 0;
    
    // Find the correct UTC time that shows as midnight in target timezone
    for (let offset = -24; offset <= 24; offset++) {
      const candidateDate = new Date(testDate.getTime() + (offset * 60 * 60 * 1000));
      const candidateDayStr = testFormatter.format(candidateDate);
      
      // Check if this candidate shows the correct date and represents start of day
      if (candidateDayStr === todayStr) {
        const hourFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: targetTimezone,
          hour: 'numeric',
          hour12: false
        });
        
        const hourInTz = parseInt(hourFormatter.format(candidateDate));
        
        // If this shows as hour 0 or 24 (midnight) in target timezone, we found it
        // Note: Intl API can return 24 for midnight (24:00 of previous day)
        if (hourInTz === 0 || hourInTz === 24) {
          return candidateDate;
        }
      }
    }
    
    // Fallback if we couldn't find the exact midnight
    return testDate;
    
  } catch (error) {
    console.warn('Failed to get start of today, falling back to simple calculation', error);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return startOfDay;
  }
}

/**
 * Get the start of today in market timezone (for market data)
 * This ensures we get data from market open, not user's local midnight
 */
export function getStartOfTodayInMarketTimezone(marketType: keyof typeof MARKET_TIMEZONES = 'US_EQUITIES'): Date {
  const marketTimezone = MARKET_TIMEZONES[marketType];
  return getStartOfTodayInUserTimezone(marketTimezone);
}

/**
 * Check if a date is today in user's timezone
 */
export function isToday(date: Date, timezone?: string): boolean {
  const targetTimezone = timezone || getUserTimezone();
  const now = new Date();
  
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: targetTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    
    const todayStr = formatter.format(now);
    const dateStr = formatter.format(date);
    
    return todayStr === dateStr;
  } catch (error) {
    console.warn('Failed to check if date is today', error);
    return date.toDateString() === now.toDateString();
  }
}

/**
 * Production-grade logging for timezone debugging
 */
export function logTimezoneDebugInfo(date: Date, label: string = 'Date'): void {
  if (process.env.NODE_ENV === 'development') {
    const timezoneInfo = getTimezoneInfo();
    console.log(`[Timezone Debug] ${label}:`, {
      originalDate: date.toISOString(),
      userTimezone: timezoneInfo.userTimezone,
      userTime: formatChartDate(date, '5min', true, timezoneInfo.userTimezone),
      marketTimezone: timezoneInfo.marketTimezone,
      marketTime: formatChartDate(date, '5min', true, timezoneInfo.marketTimezone),
      isToday: isToday(date),
    });
  }
}

export default {
  getUserTimezone,
  getTimezoneAbbreviation,
  getTimezoneInfo,
  convertUTCToUserTimezone,
  convertUTCToMarketTimezone,
  formatChartDate,
  getStartOfTodayInUserTimezone,
  getStartOfTodayInMarketTimezone,
  isToday,
  logTimezoneDebugInfo,
  MARKET_TIMEZONES,
}; 