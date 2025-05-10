"use client";

import React, { useState, useMemo, useEffect } from 'react';
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
import SectorAllocationPie from './SectorAllocationPie';
import { Skeleton } from "@/components/ui/skeleton";

// Define the structure for the fetched sector data
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

// Assuming PositionData interface is defined in parent or a shared types file
// We only need a subset for this component
interface PositionDataForPie {
    symbol: string;
    market_value: string; // Decimal as string
    asset_class: string; // e.g., 'us_equity', 'crypto'
    // Potentially add industry/sector if available and needed
    // industry?: string | null;
}

export interface AssetAllocationPieProps {
    positions: PositionDataForPie[];
    accountId: string | null;
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
            <div className="rounded-lg border bg-background p-2 shadow-sm text-sm dark:border-slate-700">
                <p className="font-semibold text-foreground">{data.name}</p>
                <p className="text-muted-foreground">{`${data.value.toFixed(2)}% (${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(data.rawValue)})`}</p>
            </div>
        );
    }
    return null;
};

const AssetAllocationPie: React.FC<AssetAllocationPieProps> = ({ positions, accountId }) => {
    const [viewType, setViewType] = useState<'assetClass' | 'sector'>('assetClass');
    
    // State for sector allocation data
    const [sectorData, setSectorData] = useState<SectorAllocationData | null>(null);
    const [isSectorLoading, setIsSectorLoading] = useState<boolean>(false);
    const [sectorError, setSectorError] = useState<string | null>(null);

    // Fetch sector data when the sector tab is active and accountId is available
    useEffect(() => {
        if (viewType === 'sector' && accountId && !sectorData && !isSectorLoading) {
            const fetchSectorData = async () => {
                setIsSectorLoading(true);
                setSectorError(null);
                try {
                    const response = await fetch(`/api/portfolio/sector-allocation?account_id=${accountId}`);
                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ detail: "Failed to fetch sector allocation data." }));
                        throw new Error(errorData.detail || `HTTP error ${response.status}`);
                    }
                    const data: SectorAllocationData = await response.json();
                    setSectorData(data);
                } catch (err: any) {
                    console.error('Error fetching sector allocation data:', err);
                    setSectorError(err.message || 'Could not load sector allocation data.');
                } finally {
                    setIsSectorLoading(false);
                }
            };
            fetchSectorData();
        }
        // No explicit cleanup needed, fetch is triggered by state change
    }, [viewType, accountId, sectorData, isSectorLoading]); // Re-run if viewType or accountId changes, or if data hasn't been loaded yet

    const allocationDataByClass = useMemo(() => {
        const totalValue = positions.reduce((sum, pos) => sum + safeParseFloat(pos.market_value), 0);
        if (totalValue === 0) return [];

        const groupedData: Record<string, number> = {};
             positions.forEach(pos => {
                const key = pos.asset_class || 'other';
                const value = safeParseFloat(pos.market_value);
                groupedData[key] = (groupedData[key] || 0) + value;
            });

        return Object.entries(groupedData).map(([name, value]) => ({
            name: name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            value: (value / totalValue) * 100,
            rawValue: value,
        })).sort((a, b) => b.rawValue - a.rawValue);

    }, [positions]);

    // Conditional rendering based on viewType
    const renderContent = () => {
        if (viewType === 'assetClass') {
             if (positions.length === 0) {
                 return (
                     <div className="h-[280px] flex items-center justify-center">
                         <CardDescription className="text-center p-4">No position data available.</CardDescription>
                     </div>
                 );
             }
            if (allocationDataByClass.length === 0) {
                return (
                    <div className="h-[280px] flex items-center justify-center">
                         <CardDescription className="text-center p-4">Could not calculate asset class allocation.</CardDescription>
                     </div>
                );
            }
            // Asset Class chart already wrapped in div with height: 280
            return (
                <div style={{ width: '100%', height: 280 }}> 
                    <ResponsiveContainer>
                        <PieChart>
                            <Pie
                                data={allocationDataByClass}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                outerRadius={85}
                                innerRadius={45}
                                fill="#8884d8"
                                dataKey="value"
                                stroke="hsl(var(--card))"
                                strokeWidth={2}
                                paddingAngle={1}
                                isAnimationActive={true} // Ensure animation is enabled
                            >
                                {allocationDataByClass.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={ASSET_CLASS_COLORS[entry.name.toLowerCase().replace(/ /g, '_')] || ASSET_CLASS_COLORS['other']} />
                                ))}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                            <Legend layout="vertical" align="right" verticalAlign="middle" iconSize={10} wrapperStyle={{ fontSize: '12px' }}/>
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            );
        } else if (viewType === 'sector') {
             // Wrap Skeleton and SectorAllocationPie in a div with fixed height
            return (
                <div className="h-[280px] w-full">
                    {isSectorLoading ? (
                        <Skeleton className="h-full w-full rounded-md" />
                    ) : (
                        <SectorAllocationPie 
                          accountId={accountId} 
                          initialData={sectorData} 
                          error={sectorError} 
                        />
                    )}
                </div>
            );
        }
        return null;
    };

    return (
        <div>
            <Tabs defaultValue="assetClass" value={viewType} onValueChange={(value) => setViewType(value as 'assetClass' | 'sector')} className="w-full mb-4">
                <TabsList className="grid w-full grid-cols-2 bg-muted p-1 h-auto">
                     <TabsTrigger value="assetClass" className="py-1 data-[state=active]:bg-card data-[state=active]:shadow-sm text-xs">By Asset Class</TabsTrigger>
                     <TabsTrigger value="sector" className="py-1 data-[state=active]:bg-card data-[state=active]:shadow-sm text-xs">
                         By Sector
                     </TabsTrigger>
                </TabsList>
            </Tabs>
            
            {/* Render the content based on the selected tab */}
            {renderContent()}
        </div>
    );
};

export default AssetAllocationPie; 