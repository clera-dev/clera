/**
 * US Market Holiday Calendar - Production Configuration
 * 
 * Official NYSE/NASDAQ trading holidays for US equity markets.
 * Updated annually based on official exchange announcements.
 * 
 * Sources:
 * - NYSE: https://www.nyse.com/markets/hours-calendars
 * - NASDAQ: https://www.nasdaqtrader.com/trader.aspx?id=calendar
 */

export interface MarketHoliday {
  date: string; // YYYY-MM-DD format
  name: string;
  status: 'closed' | 'early_close';
  closeTime?: string; // HH:MM format for early close days
  exchanges: string[];
}

export interface MarketCalendar {
  [year: string]: {
    holidays: MarketHoliday[];
    lastUpdated: string;
    source: string;
  };
}

// US Market Holiday Calendar - Centralized Configuration
export const US_MARKET_CALENDAR: MarketCalendar = {
  "2025": {
    holidays: [
      {
        date: '2025-01-01',
        name: 'New Year\'s Day',
        status: 'closed',
        exchanges: ['NYSE', 'NASDAQ']
      },
      {
        date: '2025-01-20',
        name: 'Martin Luther King Jr. Day',
        status: 'closed',
        exchanges: ['NYSE', 'NASDAQ']
      },
      {
        date: '2025-02-17',
        name: 'President\'s Day',
        status: 'closed',
        exchanges: ['NYSE', 'NASDAQ']
      },
      {
        date: '2025-04-18',
        name: 'Good Friday',
        status: 'closed',
        exchanges: ['NYSE', 'NASDAQ']
      },
      {
        date: '2025-05-26',
        name: 'Memorial Day',
        status: 'closed',
        exchanges: ['NYSE', 'NASDAQ']
      },
      {
        date: '2025-06-19',
        name: 'Juneteenth National Independence Day',
        status: 'closed',
        exchanges: ['NYSE', 'NASDAQ']
      },
      {
        date: '2025-07-03',
        name: 'Independence Day (Early Close)',
        status: 'early_close',
        closeTime: '13:00',
        exchanges: ['NYSE', 'NASDAQ']
      },
      {
        date: '2025-07-04',
        name: 'Independence Day',
        status: 'closed',
        exchanges: ['NYSE', 'NASDAQ']
      },
      {
        date: '2025-09-01',
        name: 'Labor Day',
        status: 'closed',
        exchanges: ['NYSE', 'NASDAQ']
      },
      {
        date: '2025-11-27',
        name: 'Thanksgiving Day',
        status: 'closed',
        exchanges: ['NYSE', 'NASDAQ']
      },
      {
        date: '2025-11-28',
        name: 'Day After Thanksgiving (Early Close)',
        status: 'early_close',
        closeTime: '13:00',
        exchanges: ['NYSE', 'NASDAQ']
      },
      {
        date: '2025-12-24',
        name: 'Christmas Eve (Early Close)',
        status: 'early_close',
        closeTime: '13:00',
        exchanges: ['NYSE', 'NASDAQ']
      },
      {
        date: '2025-12-25',
        name: 'Christmas Day',
        status: 'closed',
        exchanges: ['NYSE', 'NASDAQ']
      }
    ],
    lastUpdated: '2025-01-01',
    source: 'NYSE/NASDAQ Official Calendar'
  }
};

/**
 * Production utility functions for market holiday checking
 */
export class MarketHolidayUtil {
  /**
   * Check if a given date is a market holiday
   */
  static isMarketHoliday(date: Date, exchange: string = 'NYSE'): boolean {
    const year = date.getFullYear().toString();
    
    // FIXED: Use timezone-safe date string construction to avoid timezone parsing issues
    // Instead of toISOString() which can cause timezone shifts, use the actual date components
    const dateStr = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    
    const calendar = US_MARKET_CALENDAR[year];
    if (!calendar) return false;
    
    return calendar.holidays.some(holiday => 
      holiday.date === dateStr && 
      holiday.status === 'closed' &&
      holiday.exchanges.includes(exchange)
    );
  }

  /**
   * Check if a given date is an early close day
   */
  static isEarlyCloseDay(date: Date, exchange: string = 'NYSE'): MarketHoliday | null {
    const year = date.getFullYear().toString();
    
    // FIXED: Use timezone-safe date string construction to avoid timezone parsing issues
    const dateStr = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    
    const calendar = US_MARKET_CALENDAR[year];
    if (!calendar) return null;
    
    const holiday = calendar.holidays.find(holiday => 
      holiday.date === dateStr && 
      holiday.status === 'early_close' &&
      holiday.exchanges.includes(exchange)
    );
    
    return holiday || null;
  }

  /**
   * Get the most recent trading day, accounting for weekends and holidays
   */
  static getLastTradingDay(fromDate: Date, daysBack: number = 0, exchange: string = 'NYSE'): Date {
    let date = new Date(fromDate);
    date.setDate(date.getDate() - daysBack);
    
    // Keep going back until we find a trading day
    let attempts = 0;
    const maxAttempts = 15; // Allow for longer holiday periods
    
    while (attempts < maxAttempts) {
      const dayOfWeek = date.getDay();
      
      // Check if it's a weekend
      if (dayOfWeek === 6) { // Saturday
        date.setDate(date.getDate() - 1);
      } else if (dayOfWeek === 0) { // Sunday
        date.setDate(date.getDate() - 2);
      } else if (this.isMarketHoliday(date, exchange)) {
        // If it's a holiday, go back one more day
        date.setDate(date.getDate() - 1);
      } else {
        // Found a valid trading day
        break;
      }
      
      attempts++;
    }
    
    return date;
  }

  /**
   * Get all holidays for a given year
   */
  static getHolidaysForYear(year: number, exchange: string = 'NYSE'): MarketHoliday[] {
    const calendar = US_MARKET_CALENDAR[year.toString()];
    if (!calendar) return [];
    
    return calendar.holidays.filter(holiday => 
      holiday.exchanges.includes(exchange)
    );
  }

  /**
   * Check if markets are currently open (basic check - doesn't account for current time)
   */
  static isMarketOpen(date: Date = new Date(), exchange: string = 'NYSE'): boolean {
    const dayOfWeek = date.getDay();
    
    // Weekend check
    if (dayOfWeek === 0 || dayOfWeek === 6) return false;
    
    // Holiday check
    if (this.isMarketHoliday(date, exchange)) return false;
    
    // For early close days, this would require time checking
    // which can be enhanced based on requirements
    
    return true;
  }
}

export default MarketHolidayUtil; 