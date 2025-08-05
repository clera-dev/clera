'use client'

import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal, TrendingUp, TrendingDown } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import MarketHolidayUtil from "@/lib/marketHolidays";
import TimezoneUtil, { 
  formatChartDate, 
  convertUTCToUserTimezone, 
  getStartOfTodayInUserTimezone,
  logTimezoneDebugInfo,
  isToday,
  getTimezoneInfo,
  getTimezoneOffsetMinutes,
  parseFMPEasternTimestamp,
  getUserTimezone
} from "@/lib/timezone";

interface StockChartProps {
  symbol: string;
}

interface ChartDataPoint {
  date?: string;      // For intraday data
  datetime?: string;  // Alternative field name that FMP might use
  timestamp?: string; // Another possible field name
  price?: number;     // For daily data
  open?: number;      // For intraday data
  high?: number;
  low?: number;
  close?: number;
  volume: number;
}

interface ProcessedDataPoint {
  date: string;
  price: number;
  volume: number;
  formattedDate: string;
  timestamp: number;
  localDate: Date; // New: the date converted to user timezone
}

const TIME_INTERVALS = [
  { key: '1D', label: '1D', interval: '5min', days: 1 },
  { key: '1W', label: '1W', interval: '30min', days: 7 },
  { key: '1M', label: '1M', interval: 'daily', days: 30 },
  { key: '3M', label: '3M', interval: 'daily', days: 90 },
  { key: '1Y', label: '1Y', interval: 'daily', days: 365 },
  { key: '5Y', label: '5Y', interval: 'daily', days: 1825 }
];

export default function StockChart({ symbol }: StockChartProps) {
  const [data, setData] = useState<ProcessedDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedInterval, setSelectedInterval] = useState('1D');
  const [priceChange, setPriceChange] = useState<number | null>(null);
  const [priceChangePercent, setPriceChangePercent] = useState<number | null>(null);

  const formatDateForInterval = (localDate: Date, interval: string): string => {
    const selectedConfig = TIME_INTERVALS.find(t => t.key === selectedInterval);
    
    if (selectedInterval === '1D') {
      // 1D: Show full format with time and timezone: "9:30 AM PDT, June 23"
      return formatChartDate(localDate, interval, true);
    } else if (selectedInterval === '1W') {
      // 1W: Show full format with time and timezone: "9:30 AM PDT, June 23"  
      return formatChartDate(localDate, interval, true);
    } else if (interval.includes('min') || interval.includes('hour')) {
      // Other intraday: show abbreviated format
      const timeStr = formatChartDate(localDate, interval, true);
      // For intraday longer than 1D, show compact format
      return timeStr.split(',')[1]?.trim() || timeStr; // Just the date part
    } else {
      // For daily and longer periods: include year for periods > 3 months
      const shouldIncludeYear = selectedConfig && selectedConfig.days > 90;
      
      if (shouldIncludeYear) {
        return localDate.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric',
          year: 'numeric'
        });
      } else {
        return formatChartDate(localDate, interval, false);
      }
    }
  };

  useEffect(() => {
    if (!symbol) return;
    fetchChartData();
  }, [symbol, selectedInterval]);

  const fetchChartData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const intervalConfig = TIME_INTERVALS.find(t => t.key === selectedInterval);
      if (!intervalConfig) return;

      const timezoneInfo = getTimezoneInfo('US_EQUITIES');
      
      // ROBUST DATE LOGIC - Handle system clock issues and future dates
      const now = new Date();
      
      // PRODUCTION-GRADE: Use market data as a proxy for unreasonable future date
      const latestTradingDay = MarketHolidayUtil.getLastTradingDay(now);
      const daysSinceLastTradingDay = (now.getTime() - latestTradingDay.getTime()) / (1000 * 60 * 60 * 24);
      const isUnreasonableFutureDate = daysSinceLastTradingDay > 7; // More than a week after last trading day
      
      let toDate: Date;
      let fromDate: Date;
      let useIntraday = false;
      
      if (isUnreasonableFutureDate) {
        // System clock seems wrong - use a recent known good date range
        // console.warn(`[StockChart ${symbol}] System date appears to be in future (${now.toISOString()}), using fallback date range`);
        // Use the latest trading day as the anchor
        const mostRecentTradingDay = latestTradingDay;
        if (intervalConfig.interval.includes('min') || intervalConfig.interval.includes('hour')) {
          useIntraday = true;
          toDate = new Date(mostRecentTradingDay);
          fromDate = new Date(mostRecentTradingDay);
        } else {
          toDate = new Date(mostRecentTradingDay);
          fromDate = new Date(toDate);
          fromDate.setDate(fromDate.getDate() - intervalConfig.days);
        }
      } else {
        // System date seems reasonable - use normal logic
        if (intervalConfig.interval.includes('min') || intervalConfig.interval.includes('hour')) {
          useIntraday = true;
          
          // PRODUCTION-GRADE: Use proper market days logic for brokerage platform
          // Business Rules:
          // - Before 9:30 AM ET: Show previous trading day's complete data  
          // - After 9:30 AM ET on trading day: Show current trading day (intraday)
          // - Non-trading days (weekends/holidays): Show most recent trading day
          
          // Get market timing in Eastern timezone
          const easternHour = parseInt(now.toLocaleString("en-US", {
            timeZone: "America/New_York",
            hour: "2-digit",
            hour12: false
          }));
          
          const easternMinute = parseInt(now.toLocaleString("en-US", {
            timeZone: "America/New_York", 
            minute: "2-digit"
          }));
          
          // Convert to market timezone date for trading day validation
          // FIXED: Properly extract Eastern timezone date components to avoid timezone interpretation bug
          const easternParts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          }).formatToParts(now);
          
          const easternYear = parseInt(easternParts.find(part => part.type === 'year')?.value || '0');
          const easternMonth = parseInt(easternParts.find(part => part.type === 'month')?.value || '0');
          const easternDay = parseInt(easternParts.find(part => part.type === 'day')?.value || '0');
          
          // Create date with Eastern date components for accurate trading day validation
          const marketDate = new Date(easternYear, easternMonth - 1, easternDay);
          
          // Check if current market date is a valid trading day
          const isValidTradingDay = MarketHolidayUtil.isMarketOpen(marketDate);
          
          // Market timing logic (9:30 AM ET = market open)
          const isPreMarket = easternHour < 9 || (easternHour === 9 && easternMinute < 30);
          const isMarketClosed = isPreMarket || !isValidTradingDay;
          
          if (selectedInterval === '1D') {
            if (isMarketClosed) {
              // If markets are closed, use the most recent trading day
              const mostRecentTradingDay = MarketHolidayUtil.getLastTradingDay(marketDate, isValidTradingDay ? 1 : 0);
              
              // FIXED: Show ONLY the most recent trading day for proper 1D calculation
              // This ensures 1D performance represents that single trading day's open-to-close movement
              fromDate = new Date(mostRecentTradingDay);
              fromDate.setHours(0, 0, 0, 0); // Start of the trading day
              
              toDate = new Date(mostRecentTradingDay);
              toDate.setHours(23, 59, 59, 999); // End of the same trading day
            } else {
              // 1D CHART: ONLY TODAY'S DATA
              // Get start of today in user's timezone
              const startOfToday = getStartOfTodayInUserTimezone();
              
              // For 1D, we want data from start of today until now
              fromDate = startOfToday;
              toDate = now;
            }
          } else {
            // For other intraday intervals (1W), use trading days logic
            toDate = MarketHolidayUtil.getLastTradingDay(now);
            fromDate = MarketHolidayUtil.getLastTradingDay(now, intervalConfig.days);
          }
        } else {
          // For daily/weekly/monthly data, use calendar days but ensure end date is a trading day
          toDate = MarketHolidayUtil.getLastTradingDay(now);
          fromDate = new Date(toDate);
          fromDate.setDate(fromDate.getDate() - intervalConfig.days);
        }
      }

      // FIX: Use timezone-safe date string conversion instead of toISOString() 
      // which can shift dates when converting to UTC
      const formatDateSafe = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      
      const fromStr = formatDateSafe(fromDate);
      const toStr = formatDateSafe(toDate);
      
      // Add comprehensive debugging for the current issue
      if (process.env.NODE_ENV === 'development') {
        // console.log('[StockChart Debug] Chart request details:', {
        //   symbol,
        //   selectedInterval,
        //   intervalConfig,
        //   currentTime: now.toISOString(),
        //   useIntraday,
        //   fromStr,
        //   toStr,
        //   userTimezone: getUserTimezone(),
        //   isUnreasonableFutureDate
        // });
      }
      
      // Function to process raw data into chart format with timezone conversion
      const processRawData = (rawData: ChartDataPoint[]) => {
        const now = new Date(); // Current time for filtering future data
        
        // Debug: log the structure of the first few items to understand FMP response format
        if (process.env.NODE_ENV === 'development' && rawData.length > 0) {
          // console.log('[FMP Data Structure Debug]', {
          //   symbol,
          //   interval: selectedInterval,
          //   rawDataCount: rawData.length,
          //   firstItem: rawData[0],
          //   hasDate: !!rawData[0]?.date,
          //   hasDatetime: !!rawData[0]?.datetime,
          //   hasTimestamp: !!rawData[0]?.timestamp,
          //   fields: Object.keys(rawData[0] || {})
          // });
        }
        
      const processedData = rawData
        .map((item) => {
            // CORRECT FIX: FMP returns timestamps in Eastern Time (EST/EDT), NOT UTC
            // Extract the timestamp field from FMP response (field name may vary)
            const fmpTimestamp = item.date || item.datetime || item.timestamp;
            
            if (!fmpTimestamp) {
              // console.warn('[FMP Data Warning] No timestamp found in data item:', item);
              return null; // Skip items without timestamps
            }
            
            try {
              // Parse FMP Eastern timestamp correctly using our utility function
              const utcDate = parseFMPEasternTimestamp(fmpTimestamp);
              
              // Filter out any future data points
              if (utcDate > now) {
                if (process.env.NODE_ENV === 'development') {
                  // console.warn(`[Future Data Filter] Removing future data point: ${fmpTimestamp} (ET) -> ${formatChartDate(utcDate, '5min', true)} - Current time: ${formatChartDate(now, '5min', true)}`);
                }
                return null; // Will be filtered out
              }
              
              // SIMPLIFIED: Only do basic filtering to prevent over-filtering
              // Remove the complex trading day logic that was causing all data to be filtered
              
              // For development debugging - log what data we're keeping
              if (process.env.NODE_ENV === 'development') {
                // console.log(`[Data Processing] Keeping data point: ${fmpTimestamp} -> ${formatChartDate(utcDate, '5min', true)}`);
              }
              
          const price = item.price !== undefined ? item.price : item.close || 0;
          
          return {
                date: fmpTimestamp, // Use the actual timestamp field that was found
            price,
            volume: item.volume,
                formattedDate: formatDateForInterval(utcDate, intervalConfig.interval),
                timestamp: utcDate.getTime(),
                localDate: utcDate
          };
            } catch (error) {
              // console.error(`[FMP Timestamp Parse Error] Failed to parse ${fmpTimestamp}:`, error);
              return null; // Skip invalid timestamps
            }
          })
          .filter(item => item !== null) // Remove filtered items
          .sort((a, b) => a!.timestamp - b!.timestamp) as ProcessedDataPoint[];

        // Enhanced debugging for development
        if (process.env.NODE_ENV === 'development') {
          const filteredCount = rawData.length - processedData.length;
          const userTimezone = getUserTimezone();
          
          // console.log('[Chart Data Processing Results]', {
          //   symbol,
          //   interval: selectedInterval,
          //   userTimezone,
          //   currentTime: formatChartDate(now, '5min', true),
          //   originalCount: rawData.length,
          //   processedCount: processedData.length,
          //   filteredCount: filteredCount,
          //   timeRange: processedData.length > 0 ? {
          //     firstPoint: {
          //       fmpOriginal: processedData[0].date,
          //       parsedUTC: processedData[0].localDate.toISOString(),
          //       displayTime: processedData[0].formattedDate
          //     },
          //     lastPoint: {
          //       fmpOriginal: processedData[processedData.length - 1].date,
          //       parsedUTC: processedData[processedData.length - 1].localDate.toISOString(),
          //       displayTime: processedData[processedData.length - 1].formattedDate
          //     }
          //   } : null
          // });
          
          if (filteredCount > 0) {
            // console.warn(`[Data Filter] Removed ${filteredCount} data points from ${symbol} chart`);
          }
          
          // If we have no data after processing, log the raw data for debugging
          if (processedData.length === 0 && rawData.length > 0) {
            // console.error(`[Critical] All data was filtered out! Raw data sample:`, {
            //   rawDataSample: rawData.slice(0, 3),
            //   filteringSettings: {
            //     selectedInterval,
            //     useIntraday,
            //     fromStr,
            //     toStr,
            //     currentTime: now.toISOString()
            //   }
            // });
          }
        }

        return processedData;
      };

      // Function to calculate price changes
      const calculatePriceChanges = (processedData: ProcessedDataPoint[]) => {
      if (processedData.length >= 2) {
        const firstPrice = processedData[0].price;
        const lastPrice = processedData[processedData.length - 1].price;
        const change = lastPrice - firstPrice;
        const changePercent = (change / firstPrice) * 100;
        
        setPriceChange(change);
        setPriceChangePercent(changePercent);
      }
      };

      // Make the API request
      const response = await fetch(`/api/fmp/chart/${symbol}?interval=${intervalConfig.interval}&from=${fromStr}&to=${toStr}`);
      
      if (!response.ok) {
        // If intraday data fails and we're on a weekend/holiday, try daily data
        if (useIntraday && (response.status === 404 || response.status === 400)) {
          const fallbackResponse = await fetch(`/api/fmp/chart/${symbol}?interval=daily&from=${fromStr}&to=${toStr}`);
          
          if (!fallbackResponse.ok) {
            const errorData = await fallbackResponse.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || `Failed to fetch chart data: ${fallbackResponse.status}`);
          }
          
          const fallbackData = await fallbackResponse.json();
          const processedFallbackData = processRawData(fallbackData);
          
          if (processedFallbackData.length === 0) {
            throw new Error(`No chart data available for ${symbol}. The requested time period may be outside of trading hours or contain no market data.`);
          }
          
          calculatePriceChanges(processedFallbackData);
          setData(processedFallbackData);
          return;
        }
        
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Failed to fetch chart data: ${response.status}`);
      }
      
      const rawData = await response.json();
      
      if (!rawData || rawData.length === 0) {
        // If no data returned, try daily data as fallback for intraday
        if (useIntraday) {
          const fallbackResponse = await fetch(`/api/fmp/chart/${symbol}?interval=daily&from=${fromStr}&to=${toStr}`);
          
          if (fallbackResponse.ok) {
            const fallbackData = await fallbackResponse.json();
            if (fallbackData && fallbackData.length > 0) {
              const processedFallbackData = processRawData(fallbackData);
              
              if (processedFallbackData.length === 0) {
                throw new Error(`No chart data available for ${symbol}. The data may be filtered out due to timing or market hours constraints.`);
              }
              
              calculatePriceChanges(processedFallbackData);
              setData(processedFallbackData);
              return;
            }
          }
        }
        
        // If still no data, try extending the date range to get recent data
        const extendedFromDate = new Date(fromDate);
        extendedFromDate.setDate(extendedFromDate.getDate() - 7); // Go back 7 more days
        const extendedFromStr = formatDateSafe(extendedFromDate);
        
        const extendedResponse = await fetch(`/api/fmp/chart/${symbol}?interval=daily&from=${extendedFromStr}&to=${toStr}`);
        if (extendedResponse.ok) {
          const extendedData = await extendedResponse.json();
          if (extendedData && extendedData.length > 0) {
            const processedExtendedData = processRawData(extendedData);
            
            if (processedExtendedData.length === 0) {
              throw new Error(`No chart data available for ${symbol}. All available data was filtered out - this may be due to timezone or market hours constraints.`);
            }
            
            calculatePriceChanges(processedExtendedData);
            setData(processedExtendedData);
            return;
          }
        }
        
        throw new Error(`No chart data available for ${symbol}. This may be due to market closure, data unavailability, or the symbol may not be valid.`);
      }
      
      // Process the successful data
      const processedData = processRawData(rawData);
      
      if (processedData.length === 0) {
        // CRITICAL FIX: Add detailed error message when all data is filtered out
        const errorDetails = process.env.NODE_ENV === 'development' ? 
          ` Raw data received: ${rawData.length} points, but all were filtered out during processing. Check console for detailed filtering logs.` : 
          '';
        
        // If processed data is empty (due to filtering), try daily data as fallback
        const fallbackResponse = await fetch(`/api/fmp/chart/${symbol}?interval=daily&from=${fromStr}&to=${toStr}`);
        
        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          if (fallbackData && fallbackData.length > 0) {
            const processedFallbackData = processRawData(fallbackData);
            if (processedFallbackData.length > 0) {
              calculatePriceChanges(processedFallbackData);
              setData(processedFallbackData);
              return;
            }
          }
        }
        
        throw new Error(`No chart data available for ${symbol} for the current time period. This might be due to market hours, weekends, or data filtering.${errorDetails} Try selecting a different time range.`);
      }
      
      calculatePriceChanges(processedData);
      setData(processedData);
      
    } catch (error) {
      // console.error('Error fetching chart data:', error);
      setError(error instanceof Error ? error.message : 'Failed to load chart data');
    } finally {
      setLoading(false);
    }
  };

  const CustomTooltip = ({ active, payload, label, coordinate }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const localDate = data.localDate;
      const price = payload[0].value;
      
      // Format tooltip based on interval - for 1D and 1W, show full time + timezone + date
      let tooltipDate: string;
      if (selectedInterval === '1D' || selectedInterval === '1W') {
        // For 1D and 1W: "9:30 AM PDT, June 23" - full format with time and timezone
        tooltipDate = formatChartDate(localDate, '5min', true);
      } else {
        // For other intervals, use existing logic
        tooltipDate = data.formattedDate;
      }
      
      return (
        <div className="bg-black border border-[#007AFF] rounded-lg px-2 py-1 shadow-lg transition-all duration-150 ease-out">
          <p className="text-[10px] font-medium text-white/80 leading-tight">{tooltipDate}</p>
          <p className="text-sm font-semibold text-white leading-tight">
            {formatCurrency(price)}
          </p>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="p-6 lg:p-6 px-2 sm:px-4">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4 lg:mb-0">
              <Skeleton className="h-6 w-32" />
              <div className="hidden lg:flex gap-2">
                {TIME_INTERVALS.map(interval => (
                  <Skeleton key={interval.key} className="h-8 w-12" />
                ))}
              </div>
            </div>
          </div>
          <Skeleton className="h-80 w-full" />
          {/* Mobile skeleton buttons */}
          <div className="lg:hidden mt-6 pt-4 border-t border-border">
            <div className="flex flex-wrap gap-2 justify-center">
              {TIME_INTERVALS.map(interval => (
                <Skeleton key={`mobile-${interval.key}`} className="h-8 w-12" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardContent className="p-6 lg:p-6 px-2 sm:px-4">
          <Alert variant="destructive">
            <Terminal className="h-4 w-4" />
            <AlertTitle>Error Loading Chart for {symbol}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const isPositive = (priceChangePercent || 0) >= 0;

  return (
          <Card className="w-full chart-container">
        <CardContent className="p-6 lg:p-6 px-2 sm:px-4">
        {/* Header with price change - responsive layout */}
        <div className="mb-6">
          {/* Header section */}
          <div className="flex items-center justify-between mb-4 lg:mb-0">
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <h3 className="text-lg font-semibold">Price Chart</h3>
              {priceChange !== null && priceChangePercent !== null && (
                <div className={`flex items-center gap-1 px-3 py-2 rounded-lg ${
                  isPositive ? 'price-indicator-positive text-green-700 dark:text-green-400' :
                             'price-indicator-negative text-red-700 dark:text-red-400'
                }`}>
                  {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  <span className="text-sm font-medium">
                    {formatCurrency(priceChange)} ({priceChangePercent.toFixed(2)}%)
                  </span>
                </div>
              )}
            </div>
            
            {/* Time interval buttons - desktop only */}
            <div className="hidden lg:flex gap-1">
              {TIME_INTERVALS.map(interval => (
                <Button
                  key={interval.key}
                  variant={selectedInterval === interval.key ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedInterval(interval.key)}
                  className={selectedInterval === interval.key ? 'clera-assist-button text-white' : ''}
                >
                  {interval.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="h-48 sm:h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
              <defs>
                <linearGradient id="cleraGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#007AFF" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#5AC8FA" stopOpacity={0.1}/>
                </linearGradient>
                <filter id="subtleGlow">
                  <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                  <feMerge> 
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              
              <CartesianGrid 
                strokeDasharray="3 3" 
                stroke="hsl(var(--border))" 
                opacity={0.3}
              />
              
              <XAxis 
                dataKey="formattedDate"
                axisLine={false}
                tickLine={false}
                tick={false}
                interval={0}
              />
              
                              <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={false}
                  domain={['dataMin - dataMin * 0.02', 'dataMax + dataMax * 0.02']}
                  width={0}
                />
              
              <Tooltip 
                content={<CustomTooltip />}
                position={{ x: 0, y: 0 }}
                offset={-60}
                allowEscapeViewBox={{ x: false, y: false }}
                animationDuration={150}
                wrapperStyle={{ zIndex: 1000 }}
              />
              
              <Line 
                type="monotone"
                dataKey="price"
                stroke="#007AFF"
                strokeWidth={3}
                dot={false}
                fill="url(#cleraGradient)"
                filter="url(#subtleGlow)"
                className="chart-line-subtle-glow"
                style={{
                  filter: 'drop-shadow(0 0 3px rgba(0, 122, 255, 0.4))',
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Time interval buttons - mobile only (below chart) */}
        <div className="lg:hidden mt-2">
          <div className="flex flex-wrap gap-2 justify-center">
            {TIME_INTERVALS.map(interval => (
              <Button
                key={interval.key}
                variant={selectedInterval === interval.key ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedInterval(interval.key)}
                className={selectedInterval === interval.key ? 'clera-assist-button text-white' : ''}
              >
                {interval.label}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 