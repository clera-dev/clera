"use client";

import React, { useState, useMemo } from 'react';
import {
    PieChart,
    Pie,
    Cell,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Assuming PositionData interface is defined in parent or a shared types file
// We only need a subset for this component
interface PositionDataForPie {
    symbol: string;
    market_value: string; // Decimal as string
    asset_class: string; // e.g., 'us_equity', 'crypto'
    // Potentially add industry/sector if available and needed
    // industry?: string | null;
}

interface AssetAllocationPieProps {
    positions: PositionDataForPie[];
}

// Define color palettes (adjust as needed)
const ASSET_CLASS_COLORS: Record<string, string> = {
    'us_equity': 'hsl(210, 40%, 50%)', // Blue
    'crypto': 'hsl(48, 96%, 50%)', // Yellow/Gold
    'us_option': 'hsl(260, 50%, 60%)', // Purple
    'cash': 'hsl(120, 40%, 60%)', // Green (Placeholder if cash represented)
    'other': 'hsl(0, 0%, 50%)' // Grey
};

// TODO: Define Industry colors if industry data becomes available
// const INDUSTRY_COLORS: Record<string, string> = { ... };

// Helper to safely parse float
const safeParseFloat = (value: string | null | undefined): number => {
    if (value === null || value === undefined) return 0;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
};

const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
            <div className="rounded-lg border bg-background p-2 shadow-sm text-sm">
                <p className="font-semibold">{data.name}</p>
                <p className="text-muted-foreground">{`${data.value.toFixed(2)}%`}</p>
            </div>
        );
    }
    return null;
};

const AssetAllocationPie: React.FC<AssetAllocationPieProps> = ({ positions }) => {
    const [viewType, setViewType] = useState<'assetClass' | 'industry'>('assetClass');

    const allocationData = useMemo(() => {
        const totalValue = positions.reduce((sum, pos) => sum + safeParseFloat(pos.market_value), 0);
        if (totalValue === 0) return [];

        const groupedData: Record<string, number> = {};

        if (viewType === 'assetClass') {
            positions.forEach(pos => {
                const key = pos.asset_class || 'other';
                const value = safeParseFloat(pos.market_value);
                groupedData[key] = (groupedData[key] || 0) + value;
            });
        } else {
             // --- INDUSTRY LOGIC PLACEHOLDER --- 
             // TODO: Replace this when industry data is available on PositionDataForPie
             // Example structure:
             // positions.forEach(pos => {
             //     const key = pos.industry || 'Unclassified';
             //     const value = safeParseFloat(pos.market_value);
             //     groupedData[key] = (groupedData[key] || 0) + value;
             // });
             // For now, just show asset class again as a fallback
             positions.forEach(pos => {
                const key = pos.asset_class || 'other';
                const value = safeParseFloat(pos.market_value);
                groupedData[key] = (groupedData[key] || 0) + value;
            });
             // --- END PLACEHOLDER --- 
        }

        return Object.entries(groupedData).map(([name, value]) => ({
            name: name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), // Format name (e.g., us_equity -> Us Equity)
            value: (value / totalValue) * 100, // Calculate percentage
            rawValue: value,
        })).sort((a, b) => b.value - a.value); // Sort descending by value

    }, [positions, viewType]);

    const hasIndustryData = false; // TODO: Set this based on actual data availability

    if (positions.length === 0) {
        return <CardDescription>No position data available for allocation chart.</CardDescription>;
    }

    const chartColors = viewType === 'assetClass' ? ASSET_CLASS_COLORS : {}; // TODO: Use INDUSTRY_COLORS when available
    const colorKeys = Object.keys(chartColors);

    return (
        <div>
            <Tabs defaultValue="assetClass" value={viewType} onValueChange={(value) => setViewType(value as any)} className="w-full mb-4">
                <TabsList className="grid w-full grid-cols-2 bg-muted p-1 h-auto">
                     <TabsTrigger value="assetClass" className="py-1 data-[state=active]:bg-card data-[state=active]:shadow-sm text-xs">By Asset Class</TabsTrigger>
                     {/* Disable Industry tab if no data */} 
                     <TabsTrigger value="industry" disabled={!hasIndustryData} className="py-1 data-[state=active]:bg-card data-[state=active]:shadow-sm text-xs">
                         By Industry { !hasIndustryData && "(N/A)"}
                     </TabsTrigger>
                </TabsList>
            </Tabs>

            {allocationData.length === 0 && !hasIndustryData && viewType === 'industry' && (
                 <CardDescription>Industry data is not yet available for your holdings.</CardDescription>
            )}
            {allocationData.length === 0 && viewType === 'assetClass' && (
                 <CardDescription>Could not calculate asset class allocation.</CardDescription>
            )}

            {allocationData.length > 0 && (
                 <div style={{ width: '100%', height: 250 }}>
                    <ResponsiveContainer>
                        <PieChart>
                            <Pie
                                data={allocationData}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                // label={renderCustomizedLabel} // Optional: Add labels on slices
                                outerRadius={80}
                                innerRadius={40} // Make it a donut chart
                                fill="#8884d8"
                                dataKey="value"
                                stroke="hsl(var(--background))" // Add stroke for separation
                                strokeWidth={2}
                            >
                                {allocationData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={chartColors[entry.name.toLowerCase().replace(/ /g, '_')] || ASSET_CLASS_COLORS['other']} />
                                ))}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                            <Legend layout="vertical" align="right" verticalAlign="middle" iconSize={10} wrapperStyle={{ fontSize: '12px' }}/>
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
};

export default AssetAllocationPie; 