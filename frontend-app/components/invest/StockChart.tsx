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
      
      // Calculate smart date range based on interval type and current date
      const now = new Date();
      let toDate: Date;
      let fromDate: Date;
      let useIntraday = false;
      
      if (intervalConfig.interval.includes('min') || intervalConfig.interval.includes('hour')) {
        useIntraday = true;
        
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
        
        const easternToday = new Date(easternYear, easternMonth - 1, easternDay);
        const easternDayOfWeek = easternToday.getDay();
        
        const isAfterHours = easternHour >= 16 || easternHour < 9;
        const isWeekend = easternDayOfWeek === 0 || easternDayOfWeek === 6;
        const isMarketClosed = isAfterHours || isWeekend;
        
        if (selectedInterval === '1D') {
          if (isMarketClosed) {
            // If markets are closed, use the most recent trading day
            const mostRecentTradingDay = MarketHolidayUtil.getLastTradingDay(easternToday);
            
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

      const fromStr = fromDate.toISOString().split('T')[0];
      const toStr = toDate.toISOString().split('T')[0];
      
      // Add comprehensive debugging for the current issue
      if (process.env.NODE_ENV === 'development') {
        console.log('[StockChart Debug] Chart request details:', {
          symbol,
          selectedInterval,
          intervalConfig,
          currentTime: now.toISOString(),
          useIntraday,
          fromStr,
          toStr,
          userTimezone: getUserTimezone()
        });
      }
      
      // Function to process raw data into chart format with timezone conversion
      const processRawData = (rawData: ChartDataPoint[]) => {
        const now = new Date(); // Current time for filtering future data
        
        // Debug: log the structure of the first few items to understand FMP response format
        if (process.env.NODE_ENV === 'development' && rawData.length > 0) {
          console.log('[FMP Data Structure Debug]', {
            symbol,
            interval: selectedInterval,
            rawDataCount: rawData.length,
            firstItem: rawData[0],
            hasDate: !!rawData[0]?.date,
            hasDatetime: !!rawData[0]?.datetime,
            hasTimestamp: !!rawData[0]?.timestamp,
            fields: Object.keys(rawData[0] || {})
          });
        }
        
      const processedData = rawData
        .map((item) => {
            // CORRECT FIX: FMP returns timestamps in Eastern Time (EST/EDT), NOT UTC
            // Extract the timestamp field from FMP response (field name may vary)
            const fmpTimestamp = item.date || item.datetime || item.timestamp;
            
            if (!fmpTimestamp) {
              console.warn('[FMP Data Warning] No timestamp found in data item:', item);
              return null; // Skip items without timestamps
            }
            
            try {
              // Parse FMP Eastern timestamp correctly using our utility function
              const utcDate = parseFMPEasternTimestamp(fmpTimestamp);
              
              // Filter out any future data points
              if (utcDate > now) {
                if (process.env.NODE_ENV === 'development') {
                  console.warn(`[Future Data Filter] Removing future data point: ${fmpTimestamp} (ET) -> ${formatChartDate(utcDate, '5min', true)} - Current time: ${formatChartDate(now, '5min', true)}`);
                }
                return null; // Will be filtered out
              }
              
              // SIMPLIFIED: Only do basic filtering to prevent over-filtering
              // Remove the complex trading day logic that was causing all data to be filtered
              
              // For development debugging - log what data we're keeping
              if (process.env.NODE_ENV === 'development') {
                console.log(`[Data Processing] Keeping data point: ${fmpTimestamp} -> ${formatChartDate(utcDate, '5min', true)}`);
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
              console.error(`[FMP Timestamp Parse Error] Failed to parse ${fmpTimestamp}:`, error);
              return null; // Skip invalid timestamps
            }
          })
          .filter(item => item !== null) // Remove filtered items
          .sort((a, b) => a!.timestamp - b!.timestamp) as ProcessedDataPoint[];

        // Enhanced debugging for development
        if (process.env.NODE_ENV === 'development') {
          const filteredCount = rawData.length - processedData.length;
          const userTimezone = getUserTimezone();
          
          console.log('[Chart Data Processing Results]', {
            symbol,
            interval: selectedInterval,
            userTimezone,
            currentTime: formatChartDate(now, '5min', true),
            originalCount: rawData.length,
            processedCount: processedData.length,
            filteredCount: filteredCount,
            timeRange: processedData.length > 0 ? {
              firstPoint: {
                fmpOriginal: processedData[0].date,
                parsedUTC: processedData[0].localDate.toISOString(),
                displayTime: processedData[0].formattedDate
              },
              lastPoint: {
                fmpOriginal: processedData[processedData.length - 1].date,
                parsedUTC: processedData[processedData.length - 1].localDate.toISOString(),
                displayTime: processedData[processedData.length - 1].formattedDate
              }
            } : null
          });
          
          if (filteredCount > 0) {
            console.warn(`[Data Filter] Removed ${filteredCount} data points from ${symbol} chart`);
          }
          
          // If we have no data after processing, log the raw data for debugging
          if (processedData.length === 0 && rawData.length > 0) {
            console.error(`[Critical] All data was filtered out! Raw data sample:`, {
              rawDataSample: rawData.slice(0, 3),
              filteringSettings: {
                selectedInterval,
                useIntraday,
                fromStr,
                toStr,
                currentTime: now.toISOString()
              }
            });
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
        const extendedFromStr = extendedFromDate.toISOString().split('T')[0];
        
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
      console.error('Error fetching chart data:', error);
      setError(error instanceof Error ? error.message : 'Failed to load chart data');
    } finally {
      setLoading(false);
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const localDate = data.localDate;
      
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
        <div className="bg-background/95 backdrop-blur-sm border border-border rounded-lg px-2 py-1.5 shadow-lg">
          <p className="text-xs font-medium text-foreground mb-0.5">{tooltipDate}</p>
          <p className="text-sm font-semibold text-foreground">
            {formatCurrency(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <Skeleton className="h-6 w-32" />
            <div className="flex gap-2">
              {TIME_INTERVALS.map(interval => (
                <Skeleton key={interval.key} className="h-8 w-12" />
              ))}
            </div>
          </div>
          <Skeleton className="h-80 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
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
      <CardContent className="p-6">
        {/* Header with price change and interval buttons */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
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
          
          {/* Time interval buttons */}
          <div className="flex gap-1">
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

        {/* Chart */}
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
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
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                domain={['dataMin - dataMin * 0.02', 'dataMax + dataMax * 0.02']}
                tickFormatter={(value) => formatCurrency(value, 'USD', { compact: true })}
              />
              
              <Tooltip content={<CustomTooltip />} />
              
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
      </CardContent>
    </Card>
  );
} 