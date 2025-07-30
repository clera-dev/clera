/**
 * Service for handling complex market data calculations and caching.
 * 
 * This service encapsulates the complex business logic for calculating
 * chart-based percentage changes with timezone handling and caching.
 */

interface ProcessedDataItem {
  timestamp: number;
  price: number; // Keep for backward compatibility
  openPrice: number;
  closePrice: number;
  utcDate: Date;
}

interface CacheEntry {
  value: number;
  timestamp: number;
}

export class MarketDataService {
  private static instance: MarketDataService;
  private percentageCache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

  private constructor() {}

  /**
   * Get singleton instance with optional cache clearing
   */
  public static getInstance(clearCache = false): MarketDataService {
    if (!MarketDataService.instance) {
      MarketDataService.instance = new MarketDataService();
    }
    
    if (clearCache) {
      MarketDataService.instance.clearCache();
    }
    
    return MarketDataService.instance;
  }

  /**
   * Calculate chart-based percentage change for a symbol with caching
   */
  public async calculateChartBasedPercentage(symbol: string): Promise<number | undefined> {
    // Check cache first
    const cached = this.percentageCache.get(symbol);
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
      return cached.value;
    }

    try {
      const { fromDate, toDate } = await this.calculateDateRange();
      const rawData = await this.fetchChartData(symbol, fromDate, toDate);
      
      if (!rawData || !Array.isArray(rawData)) {
        return undefined;
      }

      const processedData = await this.processChartData(rawData);
      const percentage = this.calculatePercentageFromData(processedData);

      if (percentage !== undefined) {
        // Cache the result
        this.percentageCache.set(symbol, { value: percentage, timestamp: Date.now() });
      }

      return percentage;
    } catch (error) {
      console.warn(`Failed to calculate percentage for ${symbol}:`, error);
      return undefined;
    }
  }

  /**
   * Calculate the appropriate date range for chart data
   */
  private async calculateDateRange(): Promise<{ fromDate: Date; toDate: Date }> {
    const now = new Date();
    const { default: MarketHolidayUtil } = await import("@/lib/marketHolidays");
    const latestTradingDay = MarketHolidayUtil.getLastTradingDay(now);
    const daysSinceLastTradingDay = (now.getTime() - latestTradingDay.getTime()) / (1000 * 60 * 60 * 24);
    const isUnreasonableFutureDate = daysSinceLastTradingDay > 7;

    let fromDate: Date;
    let toDate: Date;

    if (isUnreasonableFutureDate) {
      fromDate = new Date(latestTradingDay);
      fromDate.setHours(0, 0, 0, 0);
      toDate = new Date(latestTradingDay);
      toDate.setHours(23, 59, 59, 999);
    } else {
      const { chartDate } = this.calculateMarketDate(now, MarketHolidayUtil);
      
      fromDate = new Date(chartDate);
      fromDate.setHours(0, 0, 0, 0);
      
      toDate = new Date(chartDate);
      toDate.setHours(23, 59, 59, 999);
    }

    return { fromDate, toDate };
  }

  /**
   * Calculate the appropriate market date based on current time and market hours
   */
  private calculateMarketDate(now: Date, MarketHolidayUtil: any): { chartDate: Date; isMarketClosed: boolean } {
    const easternHour = parseInt(now.toLocaleString("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      hour12: false
    }));
    
    const easternMinute = parseInt(now.toLocaleString("en-US", {
      timeZone: "America/New_York", 
      minute: "2-digit"
    }));
    
    const easternParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(now);
    
    const easternYear = parseInt(easternParts.find(part => part.type === 'year')?.value || '0');
    const easternMonth = parseInt(easternParts.find(part => part.type === 'month')?.value || '0');
    const easternDay = parseInt(easternParts.find(part => part.type === 'day')?.value || '0');
    
    const marketDate = new Date(easternYear, easternMonth - 1, easternDay);
    const isValidTradingDay = MarketHolidayUtil.isMarketOpen(marketDate);
    const isPreMarket = easternHour < 9 || (easternHour === 9 && easternMinute < 30);
    
    let chartDate: Date;
    let isMarketClosed: boolean;
    
    if (isPreMarket || !isValidTradingDay) {
      chartDate = MarketHolidayUtil.getLastTradingDay(marketDate, isValidTradingDay ? 1 : 0);
      isMarketClosed = true;
    } else {
      chartDate = new Date(marketDate);
      chartDate.setHours(0, 0, 0, 0);
      isMarketClosed = false;
    }

    return { chartDate, isMarketClosed };
  }

  /**
   * Fetch chart data from the API
   */
  private async fetchChartData(symbol: string, fromDate: Date, toDate: Date): Promise<any> {
    const formatDateSafe = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    const fromStr = formatDateSafe(fromDate);
    const toStr = formatDateSafe(toDate);
    
    const response = await fetch(`/api/fmp/chart/${symbol}?interval=5min&from=${fromStr}&to=${toStr}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch chart data: ${response.status}`);
    }
    
    return await response.json();
  }

  /**
   * Process raw chart data into standardized format
   */
  private async processChartData(rawData: any[]): Promise<ProcessedDataItem[]> {
    const now = new Date();
    const { parseFMPEasternTimestamp } = await import("@/lib/timezone");
    
    return rawData
      .map((item: any): ProcessedDataItem | null => {
        const fmpTimestamp = item.date || item.datetime || item.timestamp;
        if (!fmpTimestamp) return null;
        
        try {
          const utcDate = parseFMPEasternTimestamp(fmpTimestamp);
          if (utcDate > now) return null;
          
          // Extract open and close prices for accurate percentage calculation
          const openPrice = item.open || 0;
          const closePrice = item.close || 0;
          const price = closePrice; // Use close price as the default price for backward compatibility
          
          return {
            timestamp: utcDate.getTime(),
            price,
            openPrice,
            closePrice,
            utcDate
          };
        } catch (error) {
          return null;
        }
      })
      .filter((item): item is ProcessedDataItem => item !== null)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Calculate percentage change from processed data
   */
  private calculatePercentageFromData(processedData: ProcessedDataItem[]): number | undefined {
    if (processedData.length === 0) return undefined;

    const mostRecentDate = processedData[processedData.length - 1].utcDate;
    const mostRecentTradingDay = new Date(mostRecentDate);
    mostRecentTradingDay.setUTCHours(0, 0, 0, 0);
    
    const singleDayData = processedData.filter((item) => {
      const itemDate = new Date(item.utcDate);
      itemDate.setUTCHours(0, 0, 0, 0);
      return itemDate.getTime() === mostRecentTradingDay.getTime();
    });
    
    if (singleDayData.length >= 2) {
      // For accurate 1D percentage calculation:
      // - Use the opening price of the first candle of the day
      // - Use the closing price of the last candle of the day
      const firstCandle = singleDayData[0];
      const lastCandle = singleDayData[singleDayData.length - 1];
      
      // Get the actual opening and closing prices from the raw data
      const openingPrice = firstCandle.openPrice || firstCandle.price;
      const closingPrice = lastCandle.closePrice || lastCandle.price;

      if (openingPrice === 0) {
        return undefined;
      }

      return ((closingPrice - openingPrice) / openingPrice) * 100;
    }
    
    return undefined;
  }

  /**
   * Clear the cache (useful for testing or manual cache invalidation)
   */
  public clearCache(): void {
    this.percentageCache.clear();
  }

  /**
   * Get cache statistics for debugging
   */
  public getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.percentageCache.size,
      entries: Array.from(this.percentageCache.keys())
    };
  }
} 