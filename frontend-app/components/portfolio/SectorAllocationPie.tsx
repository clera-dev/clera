"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip as RechartsTooltip } from 'recharts';
import { Skeleton } from "@/components/ui/skeleton";
// Card components are not directly used here, so they can be removed if not needed for styling context
// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SectorAllocationEntry {
  sector: string;
  value: number;
  percentage: number;
}

interface SectorAllocationData {
  sectors: SectorAllocationEntry[];
  total_portfolio_value: number;
  last_data_update_timestamp?: string;
}

interface SectorAllocationPieProps {
  accountId: string | null;
  initialData: SectorAllocationData | null;
  error: string | null;
  useCompactLayout?: boolean;
}

// Refined color palette for sectors - using a professional, consistent palette
const SECTOR_COLORS: Record<string, string> = {
  'Technology': 'hsl(210, 70%, 55%)',         // Professional Blue (matching us_equity)
  'Healthcare': 'hsl(145, 60%, 50%)',         // Medical Green
  'Financial Services': 'hsl(35, 75%, 55%)',  // Financial Gold
  'Industrials': 'hsl(25, 65%, 55%)',         // Industrial Orange
  'Consumer Discretionary': 'hsl(260, 60%, 60%)', // Consumer Purple
  'Consumer Staples': 'hsl(90, 50%, 50%)',    // Staples Green
  'Energy': 'hsl(15, 75%, 55%)',              // Energy Red-Orange
  'Utilities': 'hsl(190, 55%, 50%)',          // Utility Teal
  'Real Estate': 'hsl(120, 45%, 45%)',        // Property Green
  'Communication Services': 'hsl(280, 55%, 60%)', // Comm Purple
  'Basic Materials': 'hsl(200, 60%, 55%)',    // Materials Blue
  'Broad ETFs': 'hsl(0, 0%, 65%)',            // Grey for broad market ETFs (SPY, VTI, etc.)
  'Broad Market ETFs': 'hsl(0, 0%, 65%)',     // Grey for broad market ETFs (alternative name)
  'Fixed Income': 'hsl(170, 40%, 45%)',       // Bond ETFs - Teal-Green
  'Commodities': 'hsl(40, 70%, 50%)',         // Commodity ETFs - Gold-like
  'International ETFs': 'hsl(250, 50%, 55%)', // International ETFs - Purple-Blue
  'International': 'hsl(250, 50%, 55%)',      // International (alternative name)
  'Cryptocurrency': 'hsl(25, 90%, 50%)',      // Bitcoin Orange for crypto
  'Cash & Equivalents': 'hsl(195, 70%, 60%)', // Light Blue for cash
  'Other': 'hsl(0, 0%, 55%)',                 // Dark gray for other/unknown
  'Unknown': 'hsl(0, 0%, 60%)',               // Neutral Gray
};

const generateFallbackColor = (index: number): string => {
  // A set of fallback colors if a sector is not in SECTOR_COLORS
  const fallbackColors = [
    'hsl(220, 65%, 70%)', 'hsl(160, 55%, 60%)', 'hsl(45, 75%, 70%)', 'hsl(10, 60%, 65%)', 
    'hsl(270, 55%, 75%)', 'hsl(40, 35%, 60%)', 'hsl(15, 70%, 68%)', 'hsl(195, 35%, 65%)',
    'hsl(100, 45%, 65%)', 'hsl(330, 55%, 70%)', 'hsl(205, 45%, 75%)', 'hsl(0, 0%, 75%)'
  ];
  return fallbackColors[index % fallbackColors.length];
};

const getSectorColor = (sector: string, index: number): string => {
  return SECTOR_COLORS[sector] || generateFallbackColor(index);
};

const CustomTooltipContent = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data: SectorAllocationEntry = payload[0].payload;
    return (
      <div className="rounded-lg border bg-background p-2 shadow-sm text-sm dark:border-slate-700">
        <p className="font-semibold text-foreground">{data.sector}</p>
        <p className="text-muted-foreground">
          {`${data.percentage.toFixed(2)}% (${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(data.value)})`}
        </p>
      </div>
    );
  }
  return null;
};

const SectorAllocationPie: React.FC<SectorAllocationPieProps> = ({ accountId, initialData, error, useCompactLayout = false }) => {
  const allocationData = initialData;
  const [isMobile, setIsMobile] = useState(false);

  // Update mobile state on resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile(); // Initial check
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const pieDataForChart = useMemo(() => {
    if (!allocationData || !allocationData.sectors) return [];
    
    // Prepare data with formatted names for legend display
    const formattedData = allocationData.sectors.map((entry, index) => ({
      ...entry,
      // Use the formatted display name for the legend
      name: `${entry.sector} (${entry.percentage.toFixed(1)}%)`,
      // Keep the original sector name for color mapping and tooltips
      sector: entry.sector,
      color: getSectorColor(entry.sector, index)
    }));
    
    // Filter out asset classes (not sectors) and small slices for cleaner pie chart
    return formattedData.filter(entry => 
      entry.percentage > 0.5 && 
      entry.sector !== 'Fixed Income'  // Fixed Income is an asset class, not a sector
    );
  }, [allocationData]);

  if (error) {
    return <p className="text-sm text-red-500 text-center p-4 h-[240px] flex items-center justify-center">Error: {error}</p>;
  }

  if (!allocationData || allocationData.sectors.length === 0) {
    return <p className="text-sm text-muted-foreground text-center p-4 h-[240px] flex items-center justify-center">No sector allocation data to display.</p>;
  }

  // Responsive chart configuration based on chat sidebar state AND mobile screen size
  const shouldUseCompactLayout = useCompactLayout || isMobile;
  
  const chartConfig = shouldUseCompactLayout ? {
    // Compact layout: horizontal legend below chart (when chat is open OR on mobile)
    legendLayout: "horizontal" as const,
    legendAlign: "center" as const,
    legendVerticalAlign: "bottom" as const,
    pieOuterRadius: 60,
    pieCenterY: "40%", // Move pie up more to make room for legend below
  } : {
    // Standard layout: vertical legend on right (when chat is closed AND on desktop)
    legendLayout: "vertical" as const,
    legendAlign: "right" as const,
    legendVerticalAlign: "middle" as const,
    pieOuterRadius: 70,
    pieCenterY: "50%",
  };

  return (
    <div className="w-full h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={pieDataForChart} // Use the already filtered data
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy={chartConfig.pieCenterY}
            outerRadius={chartConfig.pieOuterRadius}
            innerRadius={45}
            fill="#8884d8"
            paddingAngle={1}
            labelLine={false}
            isAnimationActive={true}
          >
            {pieDataForChart.map((entry, index) => (
              <Cell 
                key={`cell-${index}`}
                fill={entry.color}
                stroke="hsl(var(--card))"
                strokeWidth={2}
              />
            ))}
          </Pie>
          <RechartsTooltip content={<CustomTooltipContent />} />
          <Legend 
            layout={chartConfig.legendLayout}
            align={chartConfig.legendAlign}
            verticalAlign={chartConfig.legendVerticalAlign}
            iconSize={10} 
            wrapperStyle={{ 
              fontSize: '12px',
              paddingTop: shouldUseCompactLayout ? '15px' : '0px',
              paddingLeft: shouldUseCompactLayout ? '0px' : '10px'
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SectorAllocationPie; 