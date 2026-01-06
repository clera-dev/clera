/**
 * Market Hours Utility
 * 
 * Checks if the US stock market is currently open.
 * Regular trading hours: Monday-Friday, 9:30 AM - 4:00 PM ET
 * 
 * IMPORTANT: Orders can still be placed when market is closed!
 * They will be queued and executed at market open.
 */

// US Market holidays for 2024-2026 (update annually)
const MARKET_HOLIDAYS = [
  // 2024
  '2024-01-01', // New Year's Day
  '2024-01-15', // MLK Day
  '2024-02-19', // Presidents Day
  '2024-03-29', // Good Friday
  '2024-05-27', // Memorial Day
  '2024-06-19', // Juneteenth
  '2024-07-04', // Independence Day
  '2024-09-02', // Labor Day
  '2024-11-28', // Thanksgiving
  '2024-12-25', // Christmas
  // 2025
  '2025-01-01', // New Year's Day
  '2025-01-20', // MLK Day
  '2025-02-17', // Presidents Day
  '2025-04-18', // Good Friday
  '2025-05-26', // Memorial Day
  '2025-06-19', // Juneteenth
  '2025-07-04', // Independence Day
  '2025-09-01', // Labor Day
  '2025-11-27', // Thanksgiving
  '2025-12-25', // Christmas
  // 2026
  '2026-01-01', // New Year's Day
  '2026-01-19', // MLK Day  
  '2026-02-16', // Presidents Day
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
  '2026-06-19', // Juneteenth
  '2026-07-03', // Independence Day (observed - July 4th is Saturday)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving
  '2026-12-25', // Christmas
];

export interface MarketStatus {
  isOpen: boolean;
  message: string;
  nextOpenTime?: string;
  ordersAccepted: boolean;  // Orders can still be placed (queued) when market is closed
  status: 'open' | 'pre_market' | 'after_hours' | 'closed';
}

/**
 * Get the current time in Eastern Time
 */
function getEasternTime(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

/**
 * Format a date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Check if a given date is a market holiday
 */
function isMarketHoliday(date: Date): boolean {
  return MARKET_HOLIDAYS.includes(formatDate(date));
}

/**
 * Check if a given date is a trading day (weekday and not a holiday)
 */
function isTradingDay(date: Date): boolean {
  const dayOfWeek = date.getDay();
  // Weekends are not trading days
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  // Holidays are not trading days
  if (isMarketHoliday(date)) return false;
  return true;
}

/**
 * Get the next trading day after a given date
 * Accounts for weekends AND holidays
 */
function getNextTradingDay(fromDate: Date): { date: Date; description: string } {
  const result = new Date(fromDate);
  result.setDate(result.getDate() + 1);
  
  // Keep advancing until we find a trading day
  let daysAdvanced = 1;
  while (!isTradingDay(result)) {
    result.setDate(result.getDate() + 1);
    daysAdvanced++;
    // Safety limit to prevent infinite loop (max 2 weeks of holidays)
    if (daysAdvanced > 14) break;
  }
  
  // Generate human-readable description
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayNames[result.getDay()];
  
  // If it's tomorrow (1 day ahead), say "tomorrow"
  if (daysAdvanced === 1) {
    return { date: result, description: 'tomorrow' };
  }
  
  // Otherwise use the day name (e.g., "Tuesday" for a Monday holiday)
  return { date: result, description: dayName };
}

/**
 * Check if the US stock market is currently open
 */
export function isMarketOpen(): boolean {
  const now = getEasternTime();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const currentMinutes = hours * 60 + minutes;
  
  // Market hours: 9:30 AM - 4:00 PM ET
  const marketOpen = 9 * 60 + 30;  // 9:30 AM = 570 minutes
  const marketClose = 16 * 60;      // 4:00 PM = 960 minutes
  
  // Check if weekend
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }
  
  // Check if holiday
  if (isMarketHoliday(now)) {
    return false;
  }
  
  // Check if within trading hours
  return currentMinutes >= marketOpen && currentMinutes < marketClose;
}

/**
 * Get detailed market status with a user-friendly message
 * 
 * IMPORTANT: ordersAccepted is always true because orders can be queued
 * when market is closed and will execute at next market open.
 */
export function getMarketStatus(): MarketStatus {
  const now = getEasternTime();
  const dayOfWeek = now.getDay();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const currentMinutes = hours * 60 + minutes;
  
  const marketOpen = 9 * 60 + 30;
  const marketClose = 16 * 60;
  
  // Weekend
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    const nextDay = getNextTradingDay(now);
    return {
      isOpen: false,
      status: 'closed',
      message: `Markets are closed for the weekend. Your order will be queued and execute ${nextDay.description} at 9:30 AM ET.`,
      nextOpenTime: `${nextDay.description.charAt(0).toUpperCase() + nextDay.description.slice(1)} 9:30 AM ET`,
      ordersAccepted: true
    };
  }
  
  // Holiday
  if (isMarketHoliday(now)) {
    const nextDay = getNextTradingDay(now);
    return {
      isOpen: false,
      status: 'closed',
      message: `Markets are closed for a holiday. Your order will be queued and execute ${nextDay.description} at 9:30 AM ET.`,
      nextOpenTime: `${nextDay.description.charAt(0).toUpperCase() + nextDay.description.slice(1)} 9:30 AM ET`,
      ordersAccepted: true
    };
  }
  
  // Before market open (pre-market)
  if (currentMinutes < marketOpen) {
    return {
      isOpen: false,
      status: 'pre_market',
      message: "Pre-market hours. Your order will be queued and execute at 9:30 AM ET.",
      nextOpenTime: "Today 9:30 AM ET",
      ordersAccepted: true
    };
  }
  
  // After market close (after-hours)
  if (currentMinutes >= marketClose) {
    // Use getNextTradingDay to account for weekends AND holidays
    const nextDay = getNextTradingDay(now);
    return {
      isOpen: false,
      status: 'after_hours',
      message: `After-hours. Your order will be queued and execute ${nextDay.description} at 9:30 AM ET.`,
      nextOpenTime: `${nextDay.description.charAt(0).toUpperCase() + nextDay.description.slice(1)} 9:30 AM ET`,
      ordersAccepted: true
    };
  }
  
  // Market is open
  return {
    isOpen: true,
    status: 'open',
    message: "Markets are open for trading.",
    ordersAccepted: true
  };
}
