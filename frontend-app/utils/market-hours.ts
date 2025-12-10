/**
 * Market Hours Utility
 * 
 * Checks if the US stock market is currently open.
 * Regular trading hours: Monday-Friday, 9:30 AM - 4:00 PM ET
 */

// US Market holidays for 2024-2025 (update annually)
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
];

export interface MarketStatus {
  isOpen: boolean;
  message: string;
  nextOpenTime?: string;
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
  if (dayOfWeek === 0) {
    return {
      isOpen: false,
      message: "Markets are closed for the weekend. Trading resumes Monday at 9:30 AM ET.",
      nextOpenTime: "Monday 9:30 AM ET"
    };
  }
  
  if (dayOfWeek === 6) {
    return {
      isOpen: false,
      message: "Markets are closed for the weekend. Trading resumes Monday at 9:30 AM ET.",
      nextOpenTime: "Monday 9:30 AM ET"
    };
  }
  
  // Holiday
  if (isMarketHoliday(now)) {
    return {
      isOpen: false,
      message: "Markets are closed for a holiday. Please try again on the next trading day.",
      nextOpenTime: "Next trading day 9:30 AM ET"
    };
  }
  
  // Before market open
  if (currentMinutes < marketOpen) {
    return {
      isOpen: false,
      message: "Markets open at 9:30 AM ET. Please wait for the market to open.",
      nextOpenTime: "Today 9:30 AM ET"
    };
  }
  
  // After market close
  if (currentMinutes >= marketClose) {
    // Check if tomorrow is a weekend
    if (dayOfWeek === 5) {
      return {
        isOpen: false,
        message: "Markets are closed. Trading resumes Monday at 9:30 AM ET.",
        nextOpenTime: "Monday 9:30 AM ET"
      };
    }
    return {
      isOpen: false,
      message: "Markets are closed. Trading resumes tomorrow at 9:30 AM ET.",
      nextOpenTime: "Tomorrow 9:30 AM ET"
    };
  }
  
  // Market is open
  return {
    isOpen: true,
    message: "Markets are open for trading."
  };
}
