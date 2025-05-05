"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownRight, DollarSign, BarChart2, Percent, RefreshCw, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import PortfolioHistoryChart from '@/components/portfolio/PortfolioHistoryChart';
import RiskDiversificationScores from '@/components/portfolio/RiskDiversificationScores';
import AssetAllocationPie from '@/components/portfolio/AssetAllocationPie';
import WhatIfCalculator from '@/components/portfolio/WhatIfCalculator';
import HoldingsTable from '@/components/portfolio/HoldingsTable';
import TransactionsTable from '@/components/portfolio/TransactionsTable';
import AddFundsButton from '@/components/portfolio/AddFundsButton';
import LivePortfolioValue from '@/components/portfolio/LivePortfolioValue';

interface PortfolioHistoryData {
  timestamp: number[];
  equity: (number | null)[];
  profit_loss: (number | null)[];
  profit_loss_pct: (number | null)[];
  base_value: number | null;
  timeframe: string;
  base_value_asof?: string | null;
}

interface PositionData {
    asset_id: string; // UUID as string
    symbol: string;
    exchange: string;
    asset_class: string; // e.g. us_equity - Used by Pie Chart
    avg_entry_price: string; // Decimal as string
    qty: string; // Decimal as string
    side: string;
    market_value: string; // Decimal as string - Used by Pie Chart
    cost_basis: string; // Decimal as string
    unrealized_pl: string; // Decimal as string
    unrealized_plpc: string; // Decimal as string
    unrealized_intraday_pl: string; // Decimal as string
    unrealized_intraday_plpc: string; // Decimal as string
    current_price: string; // Decimal as string
    lastday_price: string; // Decimal as string
    change_today: string; // Decimal as string
    asset_marginable?: boolean | null;
    asset_shortable?: boolean | null;
    asset_easy_to_borrow?: boolean | null;
    // Frontend specific additions
    name?: string;
    weight?: number;
    // industry?: string | null; // Add if/when available from backend/asset fetch
  }

interface OrderData {
  id: string; // UUID as string
  client_order_id: string;
  created_at: string; // ISO datetime string
  updated_at?: string | null;
  submitted_at?: string | null;
  filled_at?: string | null;
  expired_at?: string | null;
  canceled_at?: string | null;
  failed_at?: string | null;
  replaced_at?: string | null;
  replaced_by?: string | null; // UUID as string
  replaces?: string | null; // UUID as string
  asset_id: string; // UUID as string
  symbol: string;
  asset_class: string;
  notional?: string | null; // Decimal as string
  qty?: string | null; // Decimal as string
  filled_qty?: string | null; // Decimal as string
  filled_avg_price?: string | null; // Decimal as string
  order_class?: string | null;
  order_type: string;
  type: string;
  side: string;
  time_in_force: string;
  limit_price?: string | null; // Decimal as string
  stop_price?: string | null; // Decimal as string
  status: string;
  extended_hours: boolean;
  legs?: any[] | null;
  trail_percent?: string | null; // Decimal as string
  trail_price?: string | null; // Decimal as string
  hwm?: string | null; // Decimal as string
  commission?: string | null; // Decimal as string
}

interface PortfolioAnalyticsData {
  risk_score: string; // Decimal as string
  diversification_score: string; // Decimal as string
}

interface AssetDetails {
    id: string;
    asset_class: string;
    exchange: string;
    symbol: string;
    name?: string | null;
    status: string;
    tradable: boolean;
    marginable: boolean;
    shortable: boolean;
    easy_to_borrow: boolean;
    fractionable: boolean;
    maintenance_margin_requirement?: number | null;
}

const safeParseFloat = (value: string | null | undefined): number | null => {
    if (value === null || value === undefined) return null;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
};

export default function PortfolioPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [portfolioData, setPortfolioData] = useState({
    totalValue: 68395.63,
    returns: {
      amount: 2578.98,
      percentage: 3.82,
      isPositive: true
    },
    performance: {
      daily: 0.25,
      weekly: 1.32,
      monthly: 2.78,
      yearly: 3.82
    },
    allocation: {
      stocks: 62,
      bonds: 28,
      cash: 6,
      other: 4
    }
  });
  const [allTimeHistory, setAllTimeHistory] = useState<PortfolioHistoryData | null>(null);
  const [analytics, setAnalytics] = useState<PortfolioAnalyticsData | null>(null);
  const [positions, setPositions] = useState<PositionData[]>([]);
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [portfolioHistory, setPortfolioHistory] = useState<PortfolioHistoryData | null>(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>('1Y');
  const [assetDetailsMap, setAssetDetailsMap] = useState<Record<string, AssetDetails>>({});
  const activitiesEndpointAvailable = React.useRef<boolean | null>(null);

  const fetchData = async (url: string, options: RequestInit = {}): Promise<any> => {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Content-Type': 'application/json',
        },
      });
      
      // Handle 404s specifically to avoid parse errors
      if (response.status === 404) {
        console.warn(`Resource not found: ${url}`);
        
        // For activities endpoint, return an empty array instead of throwing
        if (url.includes('activities')) {
          return [];
        }
        
        throw new Error(`Resource not found: ${url}`);
      }
      
      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        let errorMessage: string;
        
        // Check if response is JSON before trying to parse it
        if (contentType && contentType.includes('application/json')) {
          try {
            const errorData = await response.json();
            errorMessage = errorData.detail || `API error: ${response.statusText}`;
          } catch (parseError) {
            errorMessage = `API Error (${response.status}): ${response.statusText}`;
          }
        } else {
          errorMessage = `API Error (${response.status}): ${response.statusText}`;
        }
        
        throw new Error(errorMessage);
      }
      
      // Check content type before parsing as JSON
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      } else {
        console.warn(`Response is not JSON: ${url}`);
        return null;
      }
    } catch (err) {
      console.error(`Error fetching ${url}:`, err);
      throw err;
    }
  };

  const fetchAssetDetails = async (symbolOrId: string): Promise<AssetDetails | null> => {
    if (assetDetailsMap[symbolOrId]) {
        return assetDetailsMap[symbolOrId];
    }
    try {
        // Use the Next.js API route that properly includes the API key
        // This will go through /app/api/assets/[assetId]/route.ts instead of directly to the backend
        const url = `/api/assets/${symbolOrId}`;
        const details = await fetchData(url);
        setAssetDetailsMap(prev => ({ ...prev, [symbolOrId]: details }));
        return details;
    } catch (err) {
        console.warn(`Could not fetch details for asset: ${symbolOrId}`, err);
        return null;
    }
  };

  useEffect(() => {
    let isMounted = true;

    const getAccountInfo = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/user/account-info');
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || `Failed to fetch account info (${response.status})`);
        }
        const data = await response.json();

        if (isMounted) {
          if (data.accountId) {
            setAccountId(data.accountId);
          } else {
            setError(data.detail || "Alpaca account setup not complete.");
          }
        }
      } catch (err: any) {
        if (isMounted) {
            console.error("Error in getAccountInfo:", err);
            setError(err.message || "Failed to load account details.");
        }
      }
    };

    getAccountInfo();

    return () => { isMounted = false; };

  }, []);

  useEffect(() => {
    if (!accountId) return;

    let isMounted = true;
    const loadInitialStaticData = async () => {
        if (!isMounted) return;
        setIsLoading(true);
        setError(null);
        try {
            const positionsUrl = `/api/portfolio/positions?accountId=${accountId}`;
            const ordersUrl = `/api/portfolio/orders?accountId=${accountId}&status=all&limit=100&nested=true&include_activities=true`;
            const analyticsUrl = `/api/portfolio/analytics?accountId=${accountId}`;
            const allTimeUrl = `/api/portfolio/history?accountId=${accountId}&period=MAX`;
            
            const [positionsData, ordersData, analyticsData, allTimeData] = await Promise.all([
                fetchData(positionsUrl),
                fetchData(ordersUrl),
                fetchData(analyticsUrl),
                fetchData(allTimeUrl),
            ]);

            if (!isMounted) return;

            setAnalytics(analyticsData);
            setOrders(ordersData);
            setAllTimeHistory(allTimeData);

            const totalMarketValue = positionsData.reduce((sum: number, pos: any) => sum + (safeParseFloat(pos.market_value) ?? 0), 0);
            const enrichedPositions = await Promise.all(positionsData.map(async (pos: any) => {
                const details = await fetchAssetDetails(pos.symbol);
                const marketValue = safeParseFloat(pos.market_value);
                const weight = totalMarketValue && marketValue ? (marketValue / totalMarketValue) * 100 : 0;
                return {
                    ...pos,
                    name: details?.name || pos.symbol,
                    weight: weight,
                };
            }));
            if (isMounted) setPositions(enrichedPositions);

            const initialHistoryUrl = `/api/portfolio/history?accountId=${accountId}&period=${selectedTimeRange}`;
            const initialHistory = await fetchData(initialHistoryUrl);
            if (isMounted) setPortfolioHistory(initialHistory);

            // Only try to load activities if we haven't determined its availability yet or if it's available
            if (activitiesEndpointAvailable.current !== false) {
              try {
                const activitiesUrl = `/api/portfolio/activities?accountId=${accountId}&limit=100`;
                const response = await fetch(activitiesUrl);
                
                // Cache the availability result to avoid repeated calls
                activitiesEndpointAvailable.current = response.status !== 404;
                
                // If the activities endpoint doesn't exist (404), just continue without it
                if (response.status === 404) {
                  console.warn('Activities endpoint not available, using only orders data');
                } else if (response.ok) {
                  // Only process if the response was successful
                  const activitiesData = await response.json();
                  
                  // If we have activities data, combine it with orders for a complete transaction history
                  if (activitiesData && Array.isArray(activitiesData) && activitiesData.length > 0) {
                    // Merge activities with orders for a complete transaction history
                    const combinedTransactions = [...ordersData, ...activitiesData];
                    // Sort by date (newest first)
                    combinedTransactions.sort((a, b) => {
                      const dateA = new Date(a.created_at || a.date || 0);
                      const dateB = new Date(b.created_at || b.date || 0);
                      return dateB.getTime() - dateA.getTime();
                    });
                    if (isMounted) setOrders(combinedTransactions);
                  }
                }
              } catch (error) {
                console.warn("Could not fetch activities, using orders only:", error);
                // Mark the activities endpoint as unavailable to avoid future attempts
                activitiesEndpointAvailable.current = false;
              }
            }

        } catch (err: any) {
            if (isMounted) setError(`Failed to load initial portfolio data: ${err.message}`);
        } finally {
             if (isMounted) setIsLoading(false);
        }
    };

    loadInitialStaticData();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadInitialStaticData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => { 
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };

  }, [accountId]);

  useEffect(() => {
     if (!accountId || !selectedTimeRange) return;
     if (isLoading && !portfolioHistory && positions.length === 0 && !analytics) return;

     const currentPeriod = portfolioHistory?.timeframe;
     if (portfolioHistory && currentPeriod === selectedTimeRange) return;

     let isMounted = true;
     const loadHistory = async () => {
        if (!isMounted) return;
        setError(null);
        try {
            const historyUrl = `/api/portfolio/history?accountId=${accountId}&period=${selectedTimeRange}`;
            const historyData = await fetchData(historyUrl);
            if (isMounted) setPortfolioHistory(historyData);
        } catch (err: any) {
            if (isMounted) setError(`Failed to load history for ${selectedTimeRange}: ${err.message}`);
        }
     };

     if (selectedTimeRange === 'MAX' && allTimeHistory) {
        setPortfolioHistory(allTimeHistory);
     } else {
        loadHistory();
     }

     return () => { isMounted = false; };

  }, [accountId, selectedTimeRange, portfolioHistory?.timeframe]);

  const allTimePerformance = useMemo(() => {
    if (!allTimeHistory || !allTimeHistory.equity || allTimeHistory.equity.length === 0) {
      return { amount: null, percent: null };
    }
    const finalEquity = allTimeHistory.equity[allTimeHistory.equity.length - 1];
    const baseValue = allTimeHistory.base_value;

    if (finalEquity === null || baseValue === null) {
        const finalPL = allTimeHistory.profit_loss?.[allTimeHistory.profit_loss.length - 1];
        const finalPLP = allTimeHistory.profit_loss_pct?.[allTimeHistory.profit_loss_pct.length - 1];
        if (finalPL !== null && finalPL !== undefined && finalPLP !== null && finalPLP !== undefined) {
             return { amount: finalPL, percent: finalPLP };
        }
        return { amount: null, percent: null };
    }

    const amountReturn = finalEquity - baseValue;
    const percentReturn = allTimeHistory.profit_loss_pct?.[allTimeHistory.profit_loss_pct.length - 1] ?? (baseValue !== 0 ? (amountReturn / baseValue) : 0);

    return { amount: amountReturn, percent: percentReturn };
  }, [allTimeHistory]);

  if (isLoading && !allTimeHistory) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-8">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-48 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
        </div>
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error && !isLoading) {
    return (
     <div className="p-6 max-w-7xl mx-auto">
       <Alert variant="destructive">
         <AlertCircle className="h-4 w-4" />
         <AlertTitle>Error</AlertTitle>
         <AlertDescription>{error} <Button variant="link" size="sm" onClick={() => window.location.reload()}>Reload Page</Button></AlertDescription>
       </Alert>
     </div>
   );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 dark bg-background text-foreground">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Your Portfolio</h1>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => {
            if (accountId) {
              setIsLoading(true);
              const loadInitialStaticData = async () => {
                try {
                  const positionsUrl = `/api/portfolio/positions?accountId=${accountId}`;
                  const ordersUrl = `/api/portfolio/orders?accountId=${accountId}&status=all&limit=100&nested=true&include_activities=true`;
                  const analyticsUrl = `/api/portfolio/analytics?accountId=${accountId}`;
                  
                  const [positionsData, ordersData, analyticsData] = await Promise.all([
                    fetchData(positionsUrl),
                    fetchData(ordersUrl),
                    fetchData(analyticsUrl),
                  ]);
                  
                  setAnalytics(analyticsData);
                  setOrders(ordersData);
                  
                  // Only try to load activities if previously determined to be available
                  if (activitiesEndpointAvailable.current === true) {
                    try {
                      const activitiesUrl = `/api/portfolio/activities?accountId=${accountId}&limit=100`;
                      const activitiesData = await fetchData(activitiesUrl);
                      
                      // If we have activities data, combine it with orders for a complete transaction history
                      if (activitiesData && Array.isArray(activitiesData) && activitiesData.length > 0) {
                        // Merge activities with orders for a complete transaction history
                        const combinedTransactions = [...ordersData, ...activitiesData];
                        // Sort by date (newest first)
                        combinedTransactions.sort((a, b) => {
                          const dateA = new Date(a.created_at || a.date || 0);
                          const dateB = new Date(b.created_at || b.date || 0);
                          return dateB.getTime() - dateA.getTime();
                        });
                        setOrders(combinedTransactions);
                      }
                    } catch (error) {
                      console.warn("Could not fetch activities, using orders only:", error);
                      // Update our knowledge about the endpoint
                      activitiesEndpointAvailable.current = false;
                    }
                  }
                  
                  const totalMarketValue = positionsData.reduce((sum: number, pos: any) => sum + (safeParseFloat(pos.market_value) ?? 0), 0);
                  
                  const enrichedPositions = await Promise.all(positionsData.map(async (pos: any) => {
                    const details = await fetchAssetDetails(pos.symbol);
                    const marketValue = safeParseFloat(pos.market_value);
                    
                    const weight = totalMarketValue && marketValue ? (marketValue / totalMarketValue) * 100 : 0;
                    
                    return {
                      ...pos,
                      name: details?.name || pos.symbol,
                      weight: weight,
                    };
                  }));
                  
                  setPositions(enrichedPositions);
                  
                } catch (err: any) {
                  setError(`Failed to refresh portfolio data: ${err.message}`);
                } finally {
                  setIsLoading(false);
                }
              };
              
              loadInitialStaticData();
            }
          }}
          className="mr-2"
        >
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh
        </Button>
        <AddFundsButton accountId={accountId} />
      </div>
      
      {/* Real-time Portfolio Value with integrated chart */}
      {accountId && (
        <Card className="bg-card shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg font-medium">Portfolio Summary</CardTitle>
          </CardHeader>
          <CardContent className="pb-0">
            <LivePortfolioValue accountId={accountId} />
            
            {!portfolioHistory && isLoading ? (
              <Skeleton className="h-80 w-full mt-6" />
            ) : portfolioHistory ? (
              <div className="mt-4">
                <PortfolioHistoryChart
                  data={portfolioHistory}
                  timeRange={selectedTimeRange}
                  setTimeRange={setSelectedTimeRange}
                  allTimeReturnAmount={null}
                  allTimeReturnPercent={null}
                />
              </div>
            ) : (
              <p className="text-muted-foreground text-center p-4 mt-6">Could not load portfolio history. {error}</p>
            )}
          </CardContent>
        </Card>
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="bg-card shadow-lg">
            <CardHeader>
             <CardTitle className="text-xl">Portfolio Analytics</CardTitle>
           </CardHeader>
            <CardContent>
                {!analytics && isLoading ? (
                    <div className="space-y-6">
                         <Skeleton className="h-20 w-full" />
                         <Skeleton className="h-20 w-full" />
                     </div>
                ) : analytics ? (
                    <RiskDiversificationScores
                        accountId={accountId}
                        initialData={analytics}
                    />
                 ) : (
                    <p className="text-muted-foreground text-center">Could not load analytics scores. {error}</p>
                 )}
            </CardContent>
        </Card>

        <Card className="bg-card shadow-lg">
           <CardHeader>
              <CardTitle className="text-xl">Asset Allocation</CardTitle>
           </CardHeader>
           <CardContent>
             {!isLoading && positions.length === 0 && !error ? (
                  <p className="text-muted-foreground p-6 text-center">No positions available to display allocation.</p>
             ) : isLoading && positions.length === 0 ? (
                 <Skeleton className="h-72 w-full" />
             ) : positions.length > 0 ? (
                 <AssetAllocationPie positions={positions} />
             ) : (
                <p className="text-muted-foreground p-6 text-center">Could not load position data. {error}</p>
             )}
           </CardContent>
        </Card>
      </div>

      <Card className="bg-card shadow-lg">
         <CardHeader>
             <CardTitle className="text-xl">Investment Growth Projection</CardTitle>
         </CardHeader>
         <CardContent>
            {isLoading && positions.length === 0 ? (
                 <Skeleton className="h-40 w-full" />
            ) : (
                 <WhatIfCalculator currentPortfolioValue={positions.reduce((sum, pos) => sum + (safeParseFloat(pos.market_value) ?? 0), 0)} />
            )}
         </CardContent>
      </Card>

      <Tabs defaultValue="holdings" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-muted p-1 h-auto">
          <TabsTrigger value="holdings" className="py-2 data-[state=active]:bg-card data-[state=active]:shadow-md">Your Holdings</TabsTrigger>
          <TabsTrigger value="transactions" className="py-2 data-[state=active]:bg-card data-[state=active]:shadow-md">Pending Orders</TabsTrigger>
        </TabsList>

        <TabsContent value="holdings">
          <Card className="bg-card shadow-lg mt-4">
            <CardContent className="p-0">
              {isLoading && positions.length === 0 && !error ? (
                <Skeleton className="h-64 w-full rounded-t-none" />
              ) : positions.length > 0 ? (
                <HoldingsTable positions={positions} />
              ) : (
                 <p className="text-muted-foreground p-6 text-center">
                    {error ? `Error loading holdings: ${error}` : "You currently have no holdings."}
                 </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions">
           <Card className="bg-card shadow-lg mt-4">
             <CardContent className="p-0">
               {(isLoading && orders.length === 0 && !error) ? (
                 <Skeleton className="h-64 w-full rounded-t-none" />
               ) : orders.length > 0 ? (
                 <TransactionsTable
                    initialOrders={orders}
                    accountId={accountId}
                    fetchData={fetchData}
                 />
                ) : (
                 <p className="text-muted-foreground p-6 text-center">
                    {error ? `Error loading transactions: ${error}` : "No transactions found."}
                 </p>
                )}
             </CardContent>
           </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
} 