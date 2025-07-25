/**
 * PRODUCTION-GRADE MARKET DAYS UTILITY
 * For brokerage platforms requiring precise trading day logic
 * 
 * Business Rules:
 * - Before 9:30 AM ET: Show previous trading day's complete data
 * - After 9:30 AM ET on trading day: Show current trading day (intraday)
 * - Non-trading days (weekends/holidays): Show most recent trading day
 */

import { MarketHolidayUtil } from './marketHolidays';

export interface TradingDayResult {
  chartDate: Date;
  isCurrentTradingDay: boolean;
  isPreMarket: boolean;
  isMarketHours: boolean;
  isAfterHours: boolean;
  marketStatus: 'pre-market' | 'market-hours' | 'after-hours' | 'market-closed';
  debugInfo: {
    inputDate: string;
    marketTime: string;
    marketHour: number;
    isValidTradingDay: boolean;
    reason: string;
  };
}

/**
 * PRODUCTION-GRADE: Get the correct chart date for financial data
 * 
 * Core Logic:
 * 1. If before 9:30 AM ET on any day → previous trading day 
 * 2. If after 9:30 AM ET on trading day → current trading day
 * 3. If non-trading day → most recent trading day
 * 
 * @param inputDate - The current date/time (defaults to now)
 * @param exchange - Exchange to check (defaults to NYSE)
 * @returns TradingDayResult with chart date and market status
 */
export function getChartTradingDay(
  inputDate: Date = new Date(), 
  exchange: string = 'NYSE'
): TradingDayResult {
  
  // Get market time (Eastern timezone) for timing decisions
  const marketHour = parseInt(inputDate.toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    hour12: false
  }));
  
  const marketMinute = parseInt(inputDate.toLocaleString("en-US", {
    timeZone: "America/New_York", 
    minute: "2-digit"
  }));
  
  const marketTime = inputDate.toLocaleString("en-US", {
    timeZone: "America/New_York",
    dateStyle: "short",
    timeStyle: "short"
  });
  
  // Convert to market timezone date for trading day validation
  const marketDate = new Date(inputDate.toLocaleString("en-US", {
    timeZone: "America/New_York"
  }));
  
  // Check if current market date is a valid trading day
  const isValidTradingDay = MarketHolidayUtil.isMarketOpen(marketDate, exchange);
  
  // Market timing logic
  const isPreMarket = marketHour < 9 || (marketHour === 9 && marketMinute < 30);
  const isMarketHours = (marketHour >= 9 && marketHour < 16) && 
                       !(marketHour === 9 && marketMinute < 30);
  const isAfterHours = marketHour >= 16;
  
  let chartDate: Date;
  let isCurrentTradingDay: boolean;
  let marketStatus: TradingDayResult['marketStatus'];
  let reason: string;
  
  if (isPreMarket || !isValidTradingDay) {
    // CASE 1: Before market open OR non-trading day
    // → Show COMPLETE previous trading day data
    chartDate = MarketHolidayUtil.getLastTradingDay(marketDate, isValidTradingDay ? 1 : 0, exchange);
    isCurrentTradingDay = false;
    marketStatus = isValidTradingDay ? 'pre-market' : 'market-closed';
    reason = isValidTradingDay 
      ? `Before market open (${marketTime}) - showing previous trading day`
      : `Non-trading day (${marketTime}) - showing most recent trading day`;
      
  } else {
    // CASE 2: Market hours or after hours on trading day
    // → Show CURRENT trading day data (intraday)
    chartDate = new Date(marketDate);
    chartDate.setHours(0, 0, 0, 0); // Start of trading day
    isCurrentTradingDay = true;
    marketStatus = isMarketHours ? 'market-hours' : 'after-hours';
    reason = `Valid trading day after 9:30 AM ET - showing current trading day`;
  }
  
  return {
    chartDate,
    isCurrentTradingDay,
    isPreMarket,
    isMarketHours, 
    isAfterHours,
    marketStatus,
    debugInfo: {
      inputDate: inputDate.toISOString(),
      marketTime,
      marketHour,
      isValidTradingDay,
      reason
    }
  };
}

/**
 * Format date safely for FMP API requests
 * Ensures dates are always in YYYY-MM-DD format without timezone shifts
 */
export function formatChartDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get chart date range for different chart types
 * 
 * @param chartType - Type of chart (1D, 5D, 1M, etc.)
 * @param inputDate - Current date/time
 * @returns Object with from/to dates and market info
 */
export function getChartDateRange(
  chartType: '1D' | '5D' | '1M' | '3M' | '6M' | '1Y' | '5Y', 
  inputDate: Date = new Date()
) {
  const tradingDay = getChartTradingDay(inputDate);
  const endDate = tradingDay.chartDate;
  
  let startDate: Date;
  
  switch (chartType) {
    case '1D':
      // For 1D: Start and end on same trading day
      startDate = new Date(endDate);
      break;
      
    case '5D': 
      // Get 5 trading days back
      startDate = MarketHolidayUtil.getLastTradingDay(endDate, 5);
      break;
      
    case '1M':
      startDate = new Date(endDate);
      startDate.setMonth(startDate.getMonth() - 1);
      // Adjust to valid trading day
      startDate = MarketHolidayUtil.getLastTradingDay(startDate, 0);
      break;
      
    case '3M':
      startDate = new Date(endDate);
      startDate.setMonth(startDate.getMonth() - 3);
      startDate = MarketHolidayUtil.getLastTradingDay(startDate, 0);
      break;
      
    case '6M':
      startDate = new Date(endDate);
      startDate.setMonth(startDate.getMonth() - 6);
      startDate = MarketHolidayUtil.getLastTradingDay(startDate, 0);
      break;
      
    case '1Y':
      startDate = new Date(endDate);
      startDate.setFullYear(startDate.getFullYear() - 1);
      startDate = MarketHolidayUtil.getLastTradingDay(startDate, 0);
      break;
      
    case '5Y':
      startDate = new Date(endDate);
      startDate.setFullYear(startDate.getFullYear() - 5);
      startDate = MarketHolidayUtil.getLastTradingDay(startDate, 0);
      break;
      
    default:
      startDate = new Date(endDate);
  }
  
  return {
    fromDate: startDate,
    toDate: endDate,
    fromStr: formatChartDate(startDate),
    toStr: formatChartDate(endDate),
    marketInfo: tradingDay
  };
} 