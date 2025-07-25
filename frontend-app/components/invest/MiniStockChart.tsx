'use client'

import { useState, useEffect } from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import MarketHolidayUtil from "@/lib/marketHolidays";
import { 
  parseFMPEasternTimestamp, 
  getStartOfTodayInUserTimezone 
} from "@/lib/timezone";

interface MiniStockChartProps {
  symbol: string;
  className?: string;
}

interface ChartDataPoint {
  date?: string;
  datetime?: string;
  timestamp?: string;
  price?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume: number;
}

interface ProcessedDataPoint {
  timestamp: number;
  price: number;
}

export default function MiniStockChart({ symbol, className = "" }: MiniStockChartProps) {
  const [data, setData] = useState<ProcessedDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priceChangePercent, setPriceChangePercent] = useState<number | null>(null);

  useEffect(() => {
    if (!symbol) return;
    fetchMiniChartData();
    
    // Set up periodic updates every 30 seconds (same as main chart)
    const interval = setInterval(() => {
      fetchMiniChartData();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [symbol]);

  const fetchMiniChartData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // ROBUST DATE LOGIC - Handle system clock issues and future dates
      const now = new Date();
      
      // Use a fixed, known-good trading day as fallback if system clock is unreasonable
      const FALLBACK_DATE = new Date("2024-12-31T16:00:00-05:00"); // Last trading day of 2024, 4pm ET
      const currentYear = now.getFullYear();
      const isUnreasonableFutureDate = currentYear > (new Date().getFullYear() + 1);
      
      let toDate: Date;
      let fromDate: Date;
      let isMarketClosed = false;
      let easternToday = new Date();
      
      if (isUnreasonableFutureDate) {
        // System clock seems wrong - use a recent known good date range
        console.warn(`[MiniChart ${symbol}] System date appears to be in future (${now.toISOString()}), using fallback date range`);
        // Use the fallback date as the anchor
        easternToday = new Date(FALLBACK_DATE);
        isMarketClosed = true; // Always treat fallback as closed for safety
        // Set fromDate and toDate to the fallback trading day (start and end of day)
        fromDate = new Date(FALLBACK_DATE);
        fromDate.setHours(0, 0, 0, 0);
        toDate = new Date(FALLBACK_DATE);
        toDate.setHours(23, 59, 59, 999);
      } else {
        // System date seems reasonable - use normal logic
        // Check if markets are currently closed using proper Eastern Time
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
        const easternHour = parseInt(easternParts.find(part => part.type === 'hour')?.value || '0');
        const easternDay = parseInt(easternParts.find(part => part.type === 'day')?.value || '0');
        const easternMonth = parseInt(easternParts.find(part => part.type === 'month')?.value || '0');
        const easternYear = parseInt(easternParts.find(part => part.type === 'year')?.value || '0');
        
        easternToday = new Date(easternYear, easternMonth - 1, easternDay);
        const easternDayOfWeek = easternToday.getDay();
        
        const isAfterHours = easternHour >= 16 || easternHour < 9;
        const isWeekend = easternDayOfWeek === 0 || easternDayOfWeek === 6;
        isMarketClosed = isAfterHours || isWeekend;
        
        if (isMarketClosed) {
          // If markets are closed, use the most recent trading day (handles holidays properly)
          const mostRecentTradingDay = MarketHolidayUtil.getLastTradingDay(easternToday);
          
          // FIXED: Show ONLY the most recent trading day for proper 1D calculation
          // This ensures 1D performance represents that single trading day's open-to-close movement
          fromDate = new Date(mostRecentTradingDay);
          fromDate.setHours(0, 0, 0, 0); // Start of the trading day
          
          toDate = new Date(mostRecentTradingDay);
          toDate.setHours(23, 59, 59, 999); // End of the same trading day
        } else {
          // Markets are open - get current trading day data
          // Use the exact same logic as main chart
          const startOfToday = getStartOfTodayInUserTimezone();
          fromDate = startOfToday;
          toDate = now;
        }
      }
      
      const fromStr = fromDate.toISOString().split('T')[0];
      const toStr = toDate.toISOString().split('T')[0];
            
      // Try 5-minute data first (same as main chart)
      let response = await fetch(`/api/fmp/chart/${symbol}?interval=5min&from=${fromStr}&to=${toStr}`);
      
      if (!response.ok) {
        console.warn(`[MiniChart ${symbol}] 5min data failed, trying daily`);
        // Fallback to daily data if intraday fails
        response = await fetch(`/api/fmp/chart/${symbol}?interval=daily&from=${fromStr}&to=${toStr}`);
        if (!response.ok) {
          // If both fail, try with a wider date range that should definitely have data
          let widerFromDate: Date;
          let widerToDate: Date;
          
          if (isUnreasonableFutureDate) {
            // Use a wider range based on recent trading days
            const fallbackDate = new Date();
            fallbackDate.setDate(fallbackDate.getDate() - 30);
            widerToDate = MarketHolidayUtil.getLastTradingDay(fallbackDate);
            widerFromDate = new Date(widerToDate);
            widerFromDate.setDate(widerFromDate.getDate() - 7);
          } else {
            widerFromDate = new Date(now);
            widerFromDate.setDate(widerFromDate.getDate() - 7);
            widerToDate = toDate;
          }
          
          const widerFromStr = widerFromDate.toISOString().split('T')[0];
          const widerToStr = widerToDate.toISOString().split('T')[0];
          
          console.warn(`[MiniChart ${symbol}] Daily data failed, trying wider range: ${widerFromStr} to ${widerToStr}`);
          response = await fetch(`/api/fmp/chart/${symbol}?interval=daily&from=${widerFromStr}&to=${widerToStr}`);
          if (!response.ok) {
            throw new Error(`Failed to fetch chart data: ${response.status}`);
          }
        }
      }
      
      const rawData = await response.json();
      processChartData(rawData, isMarketClosed, easternToday);
      
    } catch (error) {
      console.error(`[MiniChart ${symbol}] Error fetching data:`, error);
      setError(error instanceof Error ? error.message : 'Failed to load chart');
    } finally {
      setLoading(false);
    }
  };

  const processChartData = (rawData: ChartDataPoint[], isMarketClosed: boolean, easternToday: Date) => {
    if (!rawData || rawData.length === 0) {
      console.warn(`[MiniChart ${symbol}] No raw data received`);
      setData([]);
      setPriceChangePercent(null);
      return;
    }

    const now = new Date();
    
    // EXACT SAME FILTERING LOGIC AS MAIN STOCKCHART
    const processedData = rawData
      .map((item) => {
        const fmpTimestamp = item.date || item.datetime || item.timestamp;
        if (!fmpTimestamp) return null;
        
        try {
          // Parse FMP Eastern timestamp correctly using the same utility function
          const utcDate = parseFMPEasternTimestamp(fmpTimestamp);
          
          // Filter out any future data points (same as main chart)
          if (utcDate > now) {
            return null;
          }
          
          // CRITICAL: Apply the same 1D filtering logic as main chart
          if (isMarketClosed) {
            // If markets are closed, show data from the most recent trading day
            const mostRecentTradingDay = MarketHolidayUtil.getLastTradingDay(easternToday);
            
            // Convert data point to Eastern time for comparison
            const dataEasternFormatter = new Intl.DateTimeFormat('en-CA', {
              timeZone: 'America/New_York',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit'
            });
            
            const dataEasternDate = dataEasternFormatter.format(utcDate);
            const tradingDayStr = `${mostRecentTradingDay.getFullYear()}-${String(mostRecentTradingDay.getMonth() + 1).padStart(2, '0')}-${String(mostRecentTradingDay.getDate()).padStart(2, '0')}`;
            
            // Only keep data from the most recent trading day
            if (dataEasternDate !== tradingDayStr) {
              return null;
            }
          } else {
            // Markets are open - be more lenient and allow recent data
            // Only filter out data that's clearly from previous days
            const dataAge = now.getTime() - utcDate.getTime();
            const oneDayMs = 24 * 60 * 60 * 1000;
            
            // Only filter if data is more than 24 hours old
            if (dataAge > oneDayMs) {
              return null;
            }
          }
          
          const price = item.price !== undefined ? item.price : item.close || 0;
          
          return {
            timestamp: utcDate.getTime(),
            price
          };
        } catch (error) {
          console.warn(`[MiniChart ${symbol}] Failed to parse timestamp:`, fmpTimestamp);
          return null;
        }
      })
      .filter(item => item !== null)
      .sort((a, b) => a!.timestamp - b!.timestamp) as ProcessedDataPoint[];

    // Calculate price change percentage (1D return) - same as main chart
    if (processedData.length >= 2) {
      const openingPrice = processedData[0].price; // Earliest time (market open)
      const closingPrice = processedData[processedData.length - 1].price; // Latest time (most recent)
      const changePercent = ((closingPrice - openingPrice) / openingPrice) * 100;
      setPriceChangePercent(changePercent);
    } else {
      setPriceChangePercent(null);
      console.warn(`[MiniChart ${symbol}] Insufficient data for percentage calculation`);
    }

    setData(processedData);
  };

  // Don't render anything while loading initially
  if (loading && data.length === 0) {
    return (
      <div className={`bg-muted animate-pulse rounded ${className}`} />
    );
  }

  // Don't render anything if there's an error or no data
  if (error || data.length === 0) {
    return (
      <div className={`bg-muted rounded ${className}`} />
    );
  }

  // Determine line color based on price change
  const lineColor = priceChangePercent !== null && priceChangePercent >= 0 ? '#22c55e' : '#ef4444';

  // Calculate price range for better visualization
  const prices = data.map(d => d.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice;
  
  // Add padding to the domain for better visualization (5% padding on each side)
  const padding = priceRange * 0.05;
  const domainMin = minPrice - padding;
  const domainMax = maxPrice + padding;

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart 
          data={data} 
          margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
        >
          <YAxis 
            type="number"
            domain={[domainMin, domainMax]}
            hide={true}
          />
          <Line 
            type="monotone"
            dataKey="price"
            stroke={lineColor}
            strokeWidth={2}
            dot={false}
            activeDot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
} 