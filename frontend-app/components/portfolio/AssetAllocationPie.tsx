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

// Define the structure for cash/stock/bond allocation data from API
interface CashStockBondAllocationItem {
  name: string;
  value: number;
  rawValue: number;
  category: 'cash' | 'stock' | 'bond';
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
    refreshTimestamp?: number;
    sideChatVisible?: boolean; // Add prop to detect when chat sidebar is open
    selectedAccountFilter?: 'total' | string;  // NEW: Account filter for X-ray vision
    userId?: string;  // NEW: User ID for aggregation mode
}

// Define color palettes - harmonious with sector colors for professional consistency
const ASSET_CLASS_COLORS: Record<string, string> = {
    'us_equity': 'hsl(210, 70%, 55%)', // Professional Blue (matching Technology sector)
    'crypto': 'hsl(35, 75%, 55%)', // Gold (matching Financial Services)
    'us_option': 'hsl(260, 60%, 60%)', // Purple (matching Consumer Discretionary)
    'cash': 'hsl(145, 60%, 50%)', // Green (matching Healthcare)
    'other': 'hsl(0, 0%, 60%)' // Grey (matching Unknown)
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

const AssetAllocationPie: React.FC<AssetAllocationPieProps> = ({ positions, accountId, refreshTimestamp, sideChatVisible = false, selectedAccountFilter = 'total', userId }) => {
    const [viewType, setViewType] = useState<'assetClass' | 'sector'>('assetClass');
    // Add mobile detection (measured post-mount to avoid SSR hydration issues)
    const [isMobile, setIsMobile] = useState(false);
    const [hasMeasured, setHasMeasured] = useState(false);
    // State for sector allocation data
    const [sectorData, setSectorData] = useState<SectorAllocationData | null>(null);
    const [isSectorLoading, setIsSectorLoading] = useState<boolean>(false);
    const [sectorError, setSectorError] = useState<string | null>(null);

    // Use compact layout when chat sidebar is visible (splits screen in half).
    // Avoid using isMobile on initial render to prevent SSR hydration flicker.
    const useCompactLayout = sideChatVisible || (hasMeasured && isMobile);

    // Fetch sector data when the sector tab is active (with account filtering support)
    useEffect(() => {
        if (viewType === 'sector' && !isSectorLoading && !sectorData) {
            const fetchSectorData = async () => {
                setIsSectorLoading(true);
                setSectorError(null);
                try {
                    // CORRECT: Use sector-allocation endpoint with filter_account parameter
                    const filterParam = (selectedAccountFilter && selectedAccountFilter !== 'total') 
                        ? `&filter_account=${selectedAccountFilter}` 
                        : '';
                    const url = `/api/portfolio/sector-allocation?account_id=${accountId || 'null'}${filterParam}`;
                    
                    console.log(`🎯 Fetching sector allocation for account filter: ${selectedAccountFilter || 'total'}`);
                    const response = await fetch(url);
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
    }, [viewType, accountId, selectedAccountFilter, userId]); // Account filter aware

    // Clear sector data when account filter changes to force refetch
    useEffect(() => {
        if (viewType === 'sector') {
            setSectorData(null); // Force refetch
        }
    }, [viewType, selectedAccountFilter]);

    // Separate effect for refreshing sector data when refreshTimestamp changes
    useEffect(() => {
        if (viewType === 'sector' && refreshTimestamp && sectorData) {
            // Only refresh if we already have data and user explicitly triggers refresh
            const refreshSectorData = async () => {
                try {
                    // CORRECT: Use sector-allocation endpoint with filter_account parameter
                    const filterParam = (selectedAccountFilter && selectedAccountFilter !== 'total') 
                        ? `&filter_account=${selectedAccountFilter}` 
                        : '';
                    const url = `/api/portfolio/sector-allocation?account_id=${accountId || 'null'}${filterParam}`;
                    
                    console.log(`🎯 Refreshing sector allocation for account filter: ${selectedAccountFilter || 'total'}`);
                    const response = await fetch(url);
                    if (response.ok) {
                        const data: SectorAllocationData = await response.json();
                        setSectorData(data);
                    }
                } catch (err) {
                    console.debug('Sector data refresh failed:', err);
                }
            };
            
            refreshSectorData();
        }
    }, [refreshTimestamp, selectedAccountFilter]); // Refresh on account filter change too

    const [cashStockBondData, setCashStockBondData] = useState<CashStockBondAllocationItem[]>([]);
    const [isCashStockBondLoading, setIsCashStockBondLoading] = useState<boolean>(false);
    const [cashStockBondError, setCashStockBondError] = useState<string | null>(null);

    // Clear cash/stock/bond data when switching away from asset class view OR when account filter changes
    useEffect(() => {
        if (viewType !== 'assetClass') {
            setCashStockBondData([]);
            setCashStockBondError(null);
            setIsCashStockBondLoading(false);
        } else {
            // Force refetch when account filter changes by clearing data
            setCashStockBondData([]);
        }
    }, [viewType, selectedAccountFilter]);

    // Fetch cash/stock/bond allocation data on initial load and view change
    useEffect(() => {
        // Allow fetch even when accountId is null (for aggregation mode)
        if (viewType === 'assetClass' && !isCashStockBondLoading && cashStockBondData.length === 0) {
            const fetchCashStockBondData = async () => {
                const currentAccountId = accountId; // Capture accountId for validation
                const currentAccountFilter = selectedAccountFilter; // Capture for validation
                setIsCashStockBondLoading(true);
                setCashStockBondError(null);
                try {
                    // CORRECT: Use cash-stock-bond-allocation endpoint with filter_account parameter
                    const filterParam = (currentAccountFilter && currentAccountFilter !== 'total') 
                        ? `&filter_account=${currentAccountFilter}` 
                        : '';
                    const url = `/api/portfolio/cash-stock-bond-allocation?accountId=${currentAccountId || 'null'}${filterParam}`;
                    
                    console.log(`🎯 Fetching initial allocation for account filter: ${currentAccountFilter || 'total'}`);
                    const response = await fetch(url);
                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ detail: "Failed to fetch cash/stock/bond allocation data." }));
                        throw new Error(errorData.detail || `HTTP error ${response.status}`);
                    }
                    const data = await response.json();
                    
                    // Validate response is still for current account/filter before updating state
                    if (currentAccountId === accountId && currentAccountFilter === selectedAccountFilter) {
                        // Handle both API formats (account-filtered returns different structure)
                        const pieData = data.pie_data || [
                            { name: 'Cash', value: data.cash?.value || 0, percentage: data.cash?.percentage || 0 },
                            { name: 'Stock', value: data.stock?.value || 0, percentage: data.stock?.percentage || 0 },
                            { name: 'Bond', value: data.bond?.value || 0, percentage: data.bond?.percentage || 0 }
                        ].filter(item => item.value > 0);
                        setCashStockBondData(pieData);
                    }
                } catch (err: any) {
                    console.error('Error fetching cash/stock/bond allocation data:', err);
                    
                    // Only update error state if still for current account
                    if (currentAccountId === accountId) {
                        setCashStockBondError(err.message || 'Could not load allocation data.');
                        // Fallback to old logic if new endpoint fails
                        setCashStockBondData([]);
                    }
                } finally {
                    // Only update loading state if still for current account
                    if (currentAccountId === accountId) {
                        setIsCashStockBondLoading(false);
                    }
                }
            };
            
            fetchCashStockBondData();
        }
    }, [viewType, accountId, selectedAccountFilter, userId]); // Account filter aware

    // Separate effect for manual refresh (only when user explicitly refreshes)
    useEffect(() => {
        if (viewType === 'assetClass' && refreshTimestamp && cashStockBondData.length > 0) {
            const refreshCashStockBondData = async () => {
                try {
                    // CORRECT: Use cash-stock-bond-allocation endpoint with filter_account parameter
                    const filterParam = (selectedAccountFilter && selectedAccountFilter !== 'total') 
                        ? `&filter_account=${selectedAccountFilter}` 
                        : '';
                    const url = `/api/portfolio/cash-stock-bond-allocation?accountId=${accountId || 'null'}${filterParam}`;
                    
                    console.log(`🎯 Fetching allocation for account filter: ${selectedAccountFilter || 'total'}`);
                    const response = await fetch(url);
                    if (response.ok) {
                        const data = await response.json();
                        // Handle both API formats
                        const pieData = data.pie_data || [
                            { name: 'Cash', value: data.cash?.value || 0, percentage: data.cash?.percentage || 0 },
                            { name: 'Stock', value: data.stock?.value || 0, percentage: data.stock?.percentage || 0 },
                            { name: 'Bond', value: data.bond?.value || 0, percentage: data.bond?.percentage || 0 }
                        ].filter(item => item.value > 0);
                        setCashStockBondData(pieData);
                    }
                } catch (err) {
                    console.debug('Allocation data refresh failed:', err);
                }
            };
            
            refreshCashStockBondData();
        }
    }, [refreshTimestamp, selectedAccountFilter]); // Refresh on account filter change too

    const allocationDataByClass = useMemo(() => {
        // Use new cash/stock/bond data if available
        if (cashStockBondData.length > 0) {
            // Apply frontend colors to backend data
            const colors = {
                'cash': '#87CEEB',    // Sky Blue
                'stock': '#4A90E2',   // Medium Blue  
                'bond': '#2E5BBA'     // Deep Blue
            };
            
            return cashStockBondData.map(item => ({
                ...item,
                color: colors[item.category as keyof typeof colors] || '#8884d8'
            }));
        }
        
        // Fallback to original asset_class grouping
        const totalValue = positions.reduce((sum, pos) => sum + safeParseFloat(pos.market_value), 0);
        if (totalValue === 0) return [];

        const groupedData: Record<string, number> = {};
             positions.forEach(pos => {
                const key = pos.asset_class || 'other';
                const value = safeParseFloat(pos.market_value);
                groupedData[key] = (groupedData[key] || 0) + value;
            });

        return Object.entries(groupedData).map(([name, value]) => {
            const percentage = (value / totalValue) * 100;
            const displayName = name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            return {
                name: `${displayName} (${percentage.toFixed(1)}%)`,
                value: percentage,
            rawValue: value,
                color: ASSET_CLASS_COLORS[name] || ASSET_CLASS_COLORS['other']
            };
        }).sort((a, b) => b.rawValue - a.rawValue);

    }, [positions, cashStockBondData]);

    // Add effect to detect mobile (client-only)
    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
            setHasMeasured(true);
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Conditional rendering based on viewType
    const renderContent = () => {
        if (viewType === 'assetClass') {
            // Show loading state while fetching cash/stock/bond data
            if (isCashStockBondLoading) {
                return (
                    <div className="h-[280px] w-full">
                        <Skeleton className="h-full w-full rounded-md" />
                    </div>
                );
            }
            
            // Show error state if cash/stock/bond fetch failed and no fallback data
            if (cashStockBondError && allocationDataByClass.length === 0) {
                return (
                    <div className="h-[280px] flex items-center justify-center">
                        <CardDescription className="text-center p-4">
                            Could not load allocation data: {cashStockBondError}
                        </CardDescription>
                    </div>
                );
            }
            
             if (positions.length === 0 && cashStockBondData.length === 0) {
                 return (
                     <div className="h-[240px] flex items-center justify-center">
                         <CardDescription className="text-center p-4">No position data available.</CardDescription>
                     </div>
                 );
             }
            if (allocationDataByClass.length === 0) {
                return (
                    <div className="h-[280px] flex items-center justify-center">
                         <CardDescription className="text-center p-4">Could not calculate asset allocation.</CardDescription>
                     </div>
                );
            }

            // Responsive chart configuration based on chat sidebar state
            const chartConfig = useCompactLayout ? {
                // Compact layout: horizontal legend below chart (when chat is open)
                legendLayout: "horizontal" as const,
                legendAlign: "center" as const,
                legendVerticalAlign: "bottom" as const,
                pieOuterRadius: 60,
                pieCenterY: "45%", // Move pie up slightly to make room for legend below
            } : {
                // Standard layout: vertical legend on right (when chat is closed)
                legendLayout: "vertical" as const,
                legendAlign: "right" as const,
                legendVerticalAlign: "middle" as const,
                pieOuterRadius: 70,
                pieCenterY: "50%",
            };

            return (
                <div className="w-full h-[240px]" aria-label="Asset class allocation pie chart"> 
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={allocationDataByClass}
                                cx="50%"
                                cy={chartConfig.pieCenterY}
                                labelLine={false}
                                outerRadius={chartConfig.pieOuterRadius}
                                innerRadius={45}
                                fill="#8884d8"
                                dataKey="value"
                                stroke="hsl(var(--card))"
                                strokeWidth={2}
                                paddingAngle={1}
                                isAnimationActive={true} // Ensure animation is enabled
                            >
                                {allocationDataByClass.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                            <Legend 
                                layout={chartConfig.legendLayout}
                                align={chartConfig.legendAlign}
                                verticalAlign={chartConfig.legendVerticalAlign}
                                iconSize={10} 
                                wrapperStyle={{ 
                                    fontSize: '12px',
                                    paddingTop: useCompactLayout ? '10px' : '0px'
                                }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            );
        } else if (viewType === 'sector') {
             // Wrap Skeleton and SectorAllocationPie in a div with fixed height - matches asset class height
            return (
                <div className="h-[240px] w-full">
                    {isSectorLoading ? (
                        <Skeleton className="h-full w-full rounded-md" />
                    ) : (
                        <SectorAllocationPie 
                          accountId={accountId} 
                          initialData={sectorData} 
                          error={sectorError}
                          useCompactLayout={useCompactLayout}
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