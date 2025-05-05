"use client";

import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { Button } from '@/components/ui/button'; // Assuming button component exists
import { format, fromUnixTime } from 'date-fns';

// Define the props interface matching the data from the parent
interface PortfolioHistoryData {
  timestamp: number[];
  equity: (number | null)[];
  profit_loss: (number | null)[];
  profit_loss_pct: (number | null)[];
  base_value: number | null;
  timeframe: string;
  base_value_asof?: string | null;
}

interface PortfolioHistoryChartProps {
  data: PortfolioHistoryData;
  timeRange: string;
  setTimeRange: (range: string) => void;
  // TODO: Add all-time performance props once calculated in parent
  allTimeReturnAmount?: number | null;
  allTimeReturnPercent?: number | null;
}

// Helper to format currency
const formatCurrency = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return '$--';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

// Helper to format percentage
const formatPercentage = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return '--%';
    // Assuming profit_loss_pct is already in percentage points * 100
    // If it's a decimal (e.g., 0.05 for 5%), multiply by 100
    // Adjust based on actual data format from API
    return `${(value * 100).toFixed(2)}%`;
};


const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const dataPoint = payload[0].payload;
    return (
      <div className="bg-card border rounded-lg p-3 shadow-lg">
        <div className="space-y-2">
          <div>
            <p className="text-xs uppercase text-muted-foreground">DATE</p>
            <p className="text-base font-semibold">
              {format(new Date(dataPoint.timestamp * 1000), 'MMM dd, yyyy')}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">VALUE</p>
            <p className="text-base font-semibold">
              {formatCurrency(dataPoint.equity)}
            </p>
          </div>
        </div>
      </div>
    );
  }
  return null;
};


const PortfolioHistoryChart: React.FC<PortfolioHistoryChartProps> = ({
  data,
  timeRange,
  setTimeRange,
  allTimeReturnAmount,
  allTimeReturnPercent
}) => {

  // Use memo for time range to prevent repeated calls
  const handleTimeRangeChange = (range: string) => {
    if (range === timeRange) return; // Don't update if it's the same
    setTimeRange(range);
  };

  const chartData = useMemo(() => {
    // For empty or missing data, create a nice flat green line
    if (!data || !data.timestamp || !data.equity || data.timestamp.length === 0) {
      // Create two points for a good looking line - one at start of range, one at end
      const now = Date.now() / 1000;
      const pastDate = now - (timeRange === '1M' ? 30 * 86400 : 
                             timeRange === '6M' ? 180 * 86400 : 365 * 86400);
      
      return [
        { timestamp: pastDate, date: fromUnixTime(pastDate), equity: 1 },
        { timestamp: now, date: fromUnixTime(now), equity: 1 }
      ];
    }
    
    // Create data points, ensuring we handle nulls by converting them to 0
    const processedData = data.timestamp.map((ts, index) => ({
      timestamp: ts, 
      date: fromUnixTime(ts),
      equity: data.equity[index] === null ? 0 : data.equity[index],
    }));
    
    // If all values are 0/null, we should create a nice flat line instead
    const hasNonZeroValues = processedData.some(item => (item.equity || 0) > 0);
    
    if (!hasNonZeroValues) {
      // For all zero values, create two points with value 1 (scale doesn't matter since Y-axis will adjust)
      const first = processedData[0];
      const last = processedData[processedData.length - 1];
      
      if (first && last) {
        return [
          { ...first, equity: 1 },
          { ...last, equity: 1 }
        ];
      }
    }
    
    return processedData;
  }, [data, timeRange]);

  // For new accounts or empty data, always show green
  const isPositiveGrowth = useMemo(() => {
    // If data is empty or all zeros, return true for green
    if (!data || !data.equity || data.equity.length === 0 || 
        data.equity.every(value => value === null || value === 0)) {
      return true;
    }
    
    // Get the first and last non-null values for comparison
    const nonNullValues = data.equity.filter(val => val !== null) as number[];
    if (nonNullValues.length < 2) return true;
    
    const startValue = nonNullValues[0];
    const endValue = nonNullValues[nonNullValues.length - 1];
    
    return endValue >= startValue;
  }, [data]);

  // Get Y-axis domain with proper padding for better visibility
  const yAxisDomain = useMemo(() => {
    if (!chartData || chartData.length === 0) return [0, 100] as const;
    
    const values = chartData.map(d => d.equity || 0).filter(v => v > 0);
    if (values.length === 0) return [0, 100] as const;
    
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    // Add padding of 10% below and 10% above for better visualization
    const range = max - min;
    const paddedMin = Math.max(0, min - range * 0.1);
    const paddedMax = max + range * 0.1;
    
    return [paddedMin, paddedMax] as [number, number];
  }, [chartData]);

  const strokeColor = isPositiveGrowth ? '#22c55e' : '#ef4444'; // Green or red
  const gradientStartColor = isPositiveGrowth ? '#22c55e' : '#ef4444';
  const gradientEndColor = isPositiveGrowth ? 'rgba(34, 197, 94, 0)' : 'rgba(239, 68, 68, 0)';
  
  const gradientId = `colorGradient-${isPositiveGrowth ? 'positive' : 'negative'}`;

  const timeRanges = ['1M', '6M', '1Y'];

  // Current value (most recent data point)
  const currentValue = useMemo(() => {
    if (!chartData || chartData.length === 0) return null;
    return chartData[chartData.length - 1]?.equity || null;
  }, [chartData]);
  
  // Format with commas for large numbers
  const formatYAxis = (value: number) => {
    if (value >= 1000000) return `$${(value/1000000).toFixed(0)}M`;
    if (value >= 1000) return `$${(value/1000).toFixed(0)}k`;
    return `$${value}`;
  };

  // TODO: Display All-Time Performance above chart
  const renderAllTimePerformance = () => {
      if (allTimeReturnAmount === undefined || allTimeReturnAmount === null || allTimeReturnPercent === undefined) {
         return <div className="h-6 mb-2"><span className="text-sm text-muted-foreground">Calculating all-time return...</span></div>;
      }
      const isAllTimePositive = allTimeReturnAmount >= 0;
      const allTimeColor = isAllTimePositive ? 'text-green-500' : 'text-red-500';

      return (
        <div className="mb-2 text-right">
          <span className="text-sm text-muted-foreground mr-2">All Time:</span>
          <span className={`font-semibold ${allTimeColor}`}>
            {isAllTimePositive ? '+' : ''}{formatCurrency(allTimeReturnAmount)} ({formatPercentage(allTimeReturnPercent)})
          </span>
        </div>
      );
  };


  return (
    <div className="space-y-4">
      <div style={{ width: '100%', height: 350 }} className="bg-background rounded-lg">
        <ResponsiveContainer>
          <AreaChart 
            data={chartData} 
            margin={{ top: 10, right: 30, left: 5, bottom: 20 }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={gradientStartColor} stopOpacity={0.5}/>
                <stop offset="100%" stopColor={gradientEndColor} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="rgba(255, 255, 255, 0.1)" 
              vertical={false} 
            />
            <XAxis
              dataKey="timestamp"
              tick={false} // Hide x-axis labels
              tickLine={false}
              axisLine={false}
              dy={10}
            />
            <YAxis
              orientation="right"
              stroke="rgba(255, 255, 255, 0.3)"
              tick={{ fontSize: 12, fill: 'rgb(156 163 175)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatYAxis}
              domain={yAxisDomain}
              width={60}
            />
            <Tooltip 
              content={<CustomTooltip />} 
              cursor={{ 
                stroke: 'rgba(255, 255, 255, 0.3)', 
                strokeWidth: 1, 
                strokeDasharray: '3 3' 
              }} 
            />
            <Area
              type="monotone"
              dataKey="equity"
              stroke={strokeColor}
              strokeWidth={2}
              fillOpacity={1}
              fill={`url(#${gradientId})`}
              dot={false}
              isAnimationActive={true}
              animationDuration={750}
            />
            {/* Add reference line for current value */}
            {currentValue && (
              <ReferenceLine 
                y={currentValue} 
                stroke="rgba(255, 255, 255, 0.3)" 
                strokeDasharray="3 3" 
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      
      {/* Time Range Buttons */}
      <div className="flex justify-center space-x-2 mt-6">
        {timeRanges.map((range) => (
          <Button
            key={range}
            variant={timeRange === range ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleTimeRangeChange(range)}
            className={`text-xs rounded-full min-w-[60px] px-4 py-2 ${
              timeRange === range 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {range}
          </Button>
        ))}
      </div>
    </div>
  );
};

export default PortfolioHistoryChart;

// Add required CSS variables in globals.css or a theme file:
/*
:root {
  --chart-positive: 142.1 70.6% 45.3%; // Example Green
  --chart-negative: 0 84.2% 60.2%;    // Example Red
}

.dark {
  --chart-positive: 142.1 70.6% 45.3%;
  --chart-negative: 0 84.2% 60.2%;
}
*/ 