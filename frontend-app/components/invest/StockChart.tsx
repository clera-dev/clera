'use client'

import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal, TrendingUp, TrendingDown } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface StockChartProps {
  symbol: string;
}

interface ChartDataPoint {
  date: string;
  price?: number; // For daily data
  open?: number;  // For intraday data
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

      // Calculate date range
      const toDate = new Date();
      const fromDate = new Date();
      fromDate.setDate(toDate.getDate() - intervalConfig.days);

      const params = new URLSearchParams({
        interval: intervalConfig.interval,
        from: fromDate.toISOString().split('T')[0],
        to: toDate.toISOString().split('T')[0]
      });

      const response = await fetch(`/api/fmp/chart/${symbol}?${params}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to fetch chart data: ${response.statusText}`);
      }

      const rawData: ChartDataPoint[] = await response.json();
      
      // Process the data
      const processedData = rawData
        .map((item) => {
          const price = item.price !== undefined ? item.price : item.close || 0;
          const date = new Date(item.date);
          
          return {
            date: item.date,
            price,
            volume: item.volume,
            formattedDate: formatDateForInterval(date, intervalConfig.interval),
            timestamp: date.getTime()
          };
        })
        .sort((a, b) => a.timestamp - b.timestamp);

      // Calculate price change
      if (processedData.length >= 2) {
        const firstPrice = processedData[0].price;
        const lastPrice = processedData[processedData.length - 1].price;
        const change = lastPrice - firstPrice;
        const changePercent = (change / firstPrice) * 100;
        
        setPriceChange(change);
        setPriceChangePercent(changePercent);
      }

      setData(processedData);
    } catch (err: any) {
      console.error('Error fetching chart data:', err);
      setError(err.message || 'Failed to fetch chart data');
    } finally {
      setLoading(false);
    }
  };

  const formatDateForInterval = (date: Date, interval: string): string => {
    const selectedConfig = TIME_INTERVALS.find(t => t.key === selectedInterval);
    
    // Special handling for specific intervals
    if (selectedInterval === '1D') {
      // 1D: Only show time (no date)
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      });
    } else if (selectedInterval === '1W') {
      // 1W: Only show date (no time) 
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric'
      });
    } else if (interval.includes('min') || interval.includes('hour')) {
      // Other intraday: show date + time
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      });
    } else {
      // For daily and longer periods: include year for periods > 3 months
      const shouldIncludeYear = selectedConfig && selectedConfig.days > 90;
      
      if (shouldIncludeYear) {
        return date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric',
          year: 'numeric'
        });
      } else {
        return date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        });
      }
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const date = new Date(data.date);
      
      // Create a comprehensive date string for the tooltip
      let tooltipDate = '';
      const selectedConfig = TIME_INTERVALS.find(t => t.key === selectedInterval);
      
      if (selectedConfig?.interval.includes('min') || selectedConfig?.interval.includes('hour')) {
        // Intraday: Full date + time
        tooltipDate = date.toLocaleDateString('en-US', { 
          weekday: 'short',
          month: 'short', 
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true 
        });
      } else {
        // Daily: Full date with weekday
        tooltipDate = date.toLocaleDateString('en-US', { 
          weekday: 'long',
          month: 'long', 
          day: 'numeric',
          year: 'numeric'
        });
      }
      
      return (
        <div className="bg-background/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-lg min-w-[200px]">
          <p className="text-sm font-medium text-foreground mb-1">{tooltipDate}</p>
          <p className="text-lg font-semibold text-foreground">
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
                interval={Math.max(1, Math.floor((data.length - 1) / 6))}
                tickFormatter={(value, index) => {
                  return value;
                }}
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