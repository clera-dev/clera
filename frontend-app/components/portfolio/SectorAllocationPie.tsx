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
}

// Refined color palette for sectors - aiming for a professional and distinct look
const SECTOR_COLORS: Record<string, string> = {
  'Technology': 'hsl(210, 70%, 55%)',         // Professional Blue
  'Healthcare': 'hsl(145, 60%, 45%)',        // Softer Green
  'Financial Services': 'hsl(35, 85%, 60%)', // Rich Gold/Orange
  'Industrials': 'hsl(0, 65%, 55%)',          // Muted Red
  'Consumer Discretionary': 'hsl(260, 60%, 65%)', // Clear Purple
  'Consumer Staples': 'hsl(30, 40%, 50%)',    // Earthy Brown
  'Energy': 'hsl(25, 75%, 60%)',             // Warm Orange/Red
  'Utilities': 'hsl(190, 40%, 55%)',         // Teal/Cyan
  'Real Estate': 'hsl(90, 50%, 55%)',         // Olive Green
  'Communication Services': 'hsl(320, 60%, 60%)',// Magenta/Pinkish
  'Basic Materials': 'hsl(200, 50%, 65%)',     // Sky Blue
  'Unknown': 'hsl(0, 0%, 65%)',              // Neutral Gray
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

const SectorAllocationPie: React.FC<SectorAllocationPieProps> = ({ accountId, initialData, error }) => {
  const allocationData = initialData;

  const pieDataForChart = useMemo(() => {
    if (!allocationData || !allocationData.sectors) return [];
    // Filter very small slices for cleaner chart, but legend will show all
    return allocationData.sectors.filter(s => s.percentage > 0.5);
  }, [allocationData]);

  if (error) {
    return <p className="text-sm text-red-500 text-center p-4 h-[280px] flex items-center justify-center">Error: {error}</p>;
  }
  
  if (!accountId) {
    return <p className="text-sm text-muted-foreground text-center p-4 h-[280px] flex items-center justify-center">Account ID not available.</p>;
  }

  if (!allocationData || allocationData.sectors.length === 0) {
    return <p className="text-sm text-muted-foreground text-center p-4 h-[280px] flex items-center justify-center">No sector allocation data to display.</p>;
  }

  // const RADIAN = Math.PI / 180;
  // const renderCustomizedLabel = ({
  //   cx, cy, midAngle, innerRadius, outerRadius, percent, index, payload
  // }: any) => {
  //   if (percent < 0.03) return null; // Don't render label for very small slices (e.g., < 3%)
  //   const radius = innerRadius + (outerRadius - innerRadius) * 0.5; 
  //   const x = cx + radius * Math.cos(-midAngle * RADIAN);
  //   const y = cy + radius * Math.sin(-midAngle * RADIAN);

  //   return (
  //     <text
  //       x={x}
  //       y={y}
  //       fill="white"
  //       textAnchor={x > cx ? 'start' : 'end'}
  //       dominantBaseline="central"
  //       fontSize="10px"
  //       fontWeight="bold"
  //     >
  //       {`${(percent * 100).toFixed(0)}%`}
  //     </text>
  //   );
  // };

  return (
    // Match height of AssetAllocationPie's chart container
    <div className="w-full h-[280px]" aria-label="Sector allocation pie chart">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={pieDataForChart} // Use filtered data for cleaner pie
            dataKey="value"
            nameKey="sector"
            cx="50%"
            cy="50%"
            outerRadius={85} // Matching AssetAllocationPie style
            innerRadius={45} // Matching AssetAllocationPie style (donut)
            fill="#8884d8" // Default fill, overridden by Cell
            paddingAngle={1}
            labelLine={false}
            isAnimationActive={true} // Ensure animation is enabled
          >
            {pieDataForChart.map((entry, index) => (
              <Cell 
                key={`cell-${index}`}
                fill={getSectorColor(entry.sector, index)}
                stroke="hsl(var(--card))" // Use card BG for stroke like in AssetAllocationPie
                strokeWidth={2}
              />
            ))}
          </Pie>
          <RechartsTooltip content={<CustomTooltipContent />} />
          <Legend 
            layout="vertical" 
            align="right" 
            verticalAlign="middle" 
            iconSize={10} 
            wrapperStyle={{ fontSize: '12px' }} // Matching AssetAllocationPie legend style
            // Use all sectors for the legend, not just the filtered ones in the pie
            payload={allocationData.sectors.map((entry, index) => ({
                value: `${entry.sector} (${entry.percentage.toFixed(1)}%)`,
                type: 'square',
                color: getSectorColor(entry.sector, index),
            }))}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SectorAllocationPie; 