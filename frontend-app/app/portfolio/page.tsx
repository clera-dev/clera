"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownRight, DollarSign, BarChart2, Percent, RefreshCw, AlertCircle, LockIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Link from 'next/link';
import { Badge } from "@/components/ui/badge";

import PortfolioHistoryChart from '@/components/portfolio/PortfolioHistoryChart';
import RiskDiversificationScoresWithAssist from '@/components/portfolio/RiskDiversificationScoresWithAssist';
import AssetAllocationPieWithAssist from '@/components/portfolio/AssetAllocationPieWithAssist';
import WhatIfCalculator from '@/components/portfolio/WhatIfCalculator';
import HoldingsTable from '@/components/portfolio/HoldingsTable';
import TransactionsTable from '@/components/portfolio/TransactionsTable';
import AddFundsButton from '@/components/portfolio/AddFundsButton';
import LivePortfolioValue from '@/components/portfolio/LivePortfolioValue';
import PortfolioSummaryWithAssist from '@/components/portfolio/PortfolioSummaryWithAssist';
import InvestmentGrowthWithAssist from '@/components/portfolio/InvestmentGrowthWithAssist';
import HoldingsTableWithAssist from '@/components/portfolio/HoldingsTableWithAssist';
import OrderModal from '@/components/invest/OrderModal';
import { Toaster } from 'react-hot-toast';
import { getAlpacaAccountId } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";
import { useCleraAssist } from "@/components/ui/clera-assist-provider";

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
  const router = useRouter();
  const { sideChatVisible } = useCleraAssist();
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
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>('1W');
  const [assetDetailsMap, setAssetDetailsMap] = useState<Record<string, AssetDetails>>({});
  const activitiesEndpointAvailable = React.useRef<boolean | null>(null);
  const [hasTradeHistory, setHasTradeHistory] = useState(false);
  const [allocationChartRefreshKey, setAllocationChartRefreshKey] = useState<number>(Date.now());
  
  // Trade action states
  const [selectedSymbolForTrade, setSelectedSymbolForTrade] = useState<string | null>(null);
  const [selectedOrderType, setSelectedOrderType] = useState<'BUY' | 'SELL'>('BUY');
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<PositionData | null>(null);
  const [activeTab, setActiveTab] = useState<string>("holdings");

  // Trade action handlers
  const handleInvestClick = (symbol: string) => {
    setSelectedSymbolForTrade(symbol);
    setSelectedOrderType('BUY');
    setSelectedPosition(null);
    setIsOrderModalOpen(true);
  };

  const handleSellClick = (symbol: string, currentQty: string) => {
    const position = positions.find((pos: PositionData) => pos.symbol === symbol);
    setSelectedPosition(position || null);
    setSelectedSymbolForTrade(symbol);
    setSelectedOrderType('SELL');
    setIsOrderModalOpen(true);
  };

  const handleOrderModalClose = (shouldRefresh = false) => {
    setIsOrderModalOpen(false);
    setSelectedSymbolForTrade(null);
    setSelectedPosition(null);
    
    // Refresh portfolio data after successful trade
    if (shouldRefresh) {
      // Trigger a refresh of positions and portfolio data using Next.js router
      router.refresh();
    }
  };

  // Function to refresh orders data
  const refreshOrders = async () => {
    if (!accountId) return;
    
    try {
      const ordersUrl = `/api/portfolio/orders?accountId=${accountId}&status=all&limit=100&nested=true&include_activities=true`;
      const refreshedOrders = await fetchData(ordersUrl);
      setOrders(refreshedOrders);
    } catch (error) {
      console.error('Error refreshing orders:', error);
    }
  };

  // Handle tab changes - refresh orders when switching to pending orders tab
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === "transactions") {
      refreshOrders();
    }
  };

  // Handle successful order cancellation - immediately remove from list
  const handleOrderCancelled = (cancelledOrderId: string) => {
    setOrders(currentOrders => 
      currentOrders.filter(order => order.id !== cancelledOrderId)
    );
  };

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

  const fetchAssetDetails = async (symbolOrId: string, bypassCache: boolean = false): Promise<AssetDetails | null> => {
    // Check cache only if not bypassing cache
    if (!bypassCache && assetDetailsMap[symbolOrId]) {
        return assetDetailsMap[symbolOrId];
    }
    try {
        // Use the Next.js API route that properly includes the API key
        // This will go through /app/api/assets/[assetId]/route.ts instead of directly to the backend
        const cacheBuster = bypassCache ? `?_cb=${Date.now()}` : '';
        const url = `/api/assets/${symbolOrId}${cacheBuster}`;
        const details = await fetchData(url, bypassCache ? {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        } : {});
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
            
            // Use Promise.allSettled instead of Promise.all to handle partial failures
            const [positionsResult, ordersResult, analyticsResult, allTimeResult] = await Promise.allSettled([
                fetchData(positionsUrl).catch(err => { 
                  console.error("Positions fetch failed:", err); 
                  return []; 
                }),
                fetchData(ordersUrl).catch(err => { 
                  console.error("Orders fetch failed:", err); 
                  return []; 
                }),
                fetchData(analyticsUrl).catch(err => { 
                  console.error("Analytics fetch failed:", err); 
                  return null; 
                }),
                fetchData(allTimeUrl).catch(err => { 
                  console.error("History fetch failed:", err); 
                  return null; 
                }),
            ]);

            if (!isMounted) return;

            // Check if we have trade history - this determines if we're in "new account" mode
            const positionsData = positionsResult.status === 'fulfilled' ? positionsResult.value : [];
            const ordersData = ordersResult.status === 'fulfilled' ? ordersResult.value : [];
            
            // If we have positions or completed orders, then user has trade history
            const hasHistory = (Array.isArray(positionsData) && positionsData.length > 0) || 
              (Array.isArray(ordersData) && ordersData.some(order => order.status === 'filled'));
            
            setHasTradeHistory(hasHistory);

            if (positionsResult.status === 'fulfilled') {
              const totalMarketValue = positionsData.reduce((sum: number, pos: any) => sum + (safeParseFloat(pos.market_value) ?? 0), 0);
              if (Array.isArray(positionsData) && positionsData.length > 0) {
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
              } else {
                setPositions([]);
              }
            }

            if (analyticsResult.status === 'fulfilled' && analyticsResult.value) {
              setAnalytics(analyticsResult.value);
            }
            
            if (ordersResult.status === 'fulfilled') {
              setOrders(ordersResult.value || []);
            }
            
            if (allTimeResult.status === 'fulfilled' && allTimeResult.value) {
              setAllTimeHistory(allTimeResult.value);
            }

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
            if (isMounted) {
              console.error("Error loading portfolio data:", err);
              // We don't set error anymore, since we're handling partial failures gracefully
              // setError(`Failed to load initial portfolio data: ${err.message}`);
            }
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

     let isMounted = true;
     const loadHistory = async () => {
        if (!isMounted) return;
        setError(null);
        try {
            const historyUrl = `/api/portfolio/history?accountId=${accountId}&period=${selectedTimeRange}`;
            const historyData = await fetchData(historyUrl);
            if (isMounted) setPortfolioHistory(historyData);
        } catch (err: any) {
            if (isMounted) {
              console.warn(`Failed to load history for ${selectedTimeRange}:`, err);
              // setError(`Failed to load history for ${selectedTimeRange}: ${err.message}`);
            }
        }
     };

     if (selectedTimeRange === 'MAX' && allTimeHistory) {
        setPortfolioHistory(allTimeHistory);
     } else {
        loadHistory();
     }

     return () => { isMounted = false; };
  }, [accountId, selectedTimeRange, allTimeHistory]);

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
      <div className="p-4 space-y-6">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-48 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
        </div>
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error && !isLoading && !accountId) {
    return (
     <div className="p-4">
       <Alert variant="destructive">
         <AlertCircle className="h-4 w-4" />
         <AlertTitle>Error</AlertTitle>
         <AlertDescription>{error} <Button variant="link" size="sm" onClick={() => router.refresh()}>Reload Page</Button></AlertDescription>
       </Alert>
     </div>
   );
  }

  // Define the overlay style for locked sections
  const lockedSectionStyle = !hasTradeHistory ? {
    position: 'relative',
    filter: 'blur(2px)',
    opacity: 0.6,
    pointerEvents: 'none'
  } as React.CSSProperties : undefined;

  return (
    <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="py-4 space-y-6 bg-background text-foreground w-full h-full">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold">Your Portfolio</h1>
            <p className="text-lg text-muted-foreground mt-1">Track your investments and performance</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Button 
              variant="outline" 
              size="sm"
              className="h-8 px-3 text-sm sm:h-9 sm:px-4"
              disabled={isLoading}
              onClick={() => {
                if (accountId) {
                  setIsLoading(true);
                  
                  // Clear any existing state to force fresh data
                  setAnalytics(null);
                  setPositions([]);
                  setOrders([]);
                  setPortfolioHistory(null);
                  setError(null);
                  
                  // Clear asset details cache to force fresh asset fetches
                  setAssetDetailsMap({});
                  
                  const loadInitialStaticData = async () => {
                    try {
                      
                      // Add cache-busting timestamp to all requests
                      const cacheBuster = `_cb=${Date.now()}`;
                      const positionsUrl = `/api/portfolio/positions?accountId=${accountId}&${cacheBuster}`;
                      const ordersUrl = `/api/portfolio/orders?accountId=${accountId}&status=all&limit=100&nested=true&include_activities=true&${cacheBuster}`;
                      const analyticsUrl = `/api/portfolio/analytics?accountId=${accountId}&${cacheBuster}`;
                      
                      // Use fetch with cache-busting headers to ensure fresh data
                      const fetchWithCacheBusting = async (url: string) => {
                        return fetchData(url, {
                          headers: {
                            'Cache-Control': 'no-cache, no-store, must-revalidate',
                            'Pragma': 'no-cache',
                            'Expires': '0'
                          }
                        });
                      };
                      
                      const [positionsData, ordersData, analyticsData] = await Promise.all([
                        fetchWithCacheBusting(positionsUrl),
                        fetchWithCacheBusting(ordersUrl),
                        fetchWithCacheBusting(analyticsUrl),
                      ]);
                      
                      // Set analytics data first and log the fresh values
                      setAnalytics(analyticsData);
                      
                      // Initialize combinedTransactions with ordersData
                      let combinedTransactions = Array.isArray(ordersData) ? [...ordersData] : [];

                      // Only try to load activities if previously determined to be available
                      if (activitiesEndpointAvailable.current === true) {
                        try {
                          const activitiesUrl = `/api/portfolio/activities?accountId=${accountId}&limit=100&${cacheBuster}`;
                          const activitiesData = await fetchWithCacheBusting(activitiesUrl);
                          
                          if (activitiesData && Array.isArray(activitiesData) && activitiesData.length > 0) {
                            combinedTransactions = [...combinedTransactions, ...activitiesData];
                            combinedTransactions.sort((a, b) => {
                              const dateA = new Date(a.created_at || a.date || 0);
                              const dateB = new Date(b.created_at || b.date || 0);
                              return dateB.getTime() - dateA.getTime();
                            });
                          }
                        } catch (error) {
                          console.warn("[Refresh Button] - Could not fetch activities, using orders only:", error);
                          activitiesEndpointAvailable.current = false;
                        }
                      }
                      setOrders(combinedTransactions);
                      
                      const totalMarketValue = Array.isArray(positionsData) ? positionsData.reduce((sum: number, pos: any) => sum + (safeParseFloat(pos.market_value) ?? 0), 0) : 0;
                      
                      // Force fresh asset details fetch for each position
                      const enrichedPositions = Array.isArray(positionsData) ? await Promise.all(positionsData.map(async (pos: any) => {
                        // Force fresh asset details fetch by bypassing cache
                        const details = await fetchAssetDetails(pos.symbol, true); // true = bypass cache
                        const marketValue = safeParseFloat(pos.market_value);
                        const weight = totalMarketValue && marketValue ? (marketValue / totalMarketValue) * 100 : 0;
                        return {
                          ...pos,
                          name: details?.name || pos.symbol,
                          weight: weight,
                        };
                      })) : [];
                      
                      setPositions(enrichedPositions);
                      
                      // Also refresh the history with the current selected time range
                      const historyUrl = `/api/portfolio/history?accountId=${accountId}&period=${selectedTimeRange}&${cacheBuster}`;
                      const historyData = await fetchWithCacheBusting(historyUrl);
                      setPortfolioHistory(historyData);
                      
                      // Update all time history if we're on MAX timeframe
                      if (selectedTimeRange === 'MAX') {
                        setAllTimeHistory(historyData);
                      }
                      
                    } catch (err: any) {
                      console.error("[Refresh Button] - Error refreshing portfolio data:", err);
                      setError(`Failed to refresh portfolio data: ${err.message}`);
                    } finally {
                      setIsLoading(false);
                      // Force refresh of all chart components
                      setAllocationChartRefreshKey(Date.now()); 
                    }
                  };
                  
                  loadInitialStaticData();
                }
              }}
            >
              <RefreshCw className={`h-3 w-3 sm:h-4 sm:w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? 'Refreshing...' : 'Refresh'}
            </Button>
            <AddFundsButton accountId={accountId} />
          </div>
        </div>
        


        {/* Notification for new users */}
        {!hasTradeHistory && accountId && (
          <Alert variant="default" className="bg-primary/10 border-primary text-foreground">
            <AlertTitle className="flex items-center gap-2 text-base md:text-lg">
              <LockIcon size={18} className="text-primary" /> 
              Your portfolio analysis is waiting for your first trade
            </AlertTitle>
            <AlertDescription className="mt-2">
              <p className="mb-3">Your portfolio page will populate after your first trade. If you've executed a trade already, please wait for the trade to settle.</p>
              <Link href="/invest">
                <Button className="mt-2">Make your first trade</Button>
              </Link>
            </AlertDescription>
          </Alert>
        )}
        
        {/* Main Content Grid - New Optimized Layout */}
        <div style={lockedSectionStyle} className="space-y-4 sm:space-y-6">
          
          {/* Row 1: Portfolio Chart (2/3) + Analytics & Allocation (1/3) */}
          <div className={`grid grid-cols-1 gap-4 lg:gap-6 ${
            sideChatVisible 
              ? '2xl:grid-cols-3' // When chat is open, only go horizontal on 2xl+ screens (1536px+)
              : 'lg:grid-cols-5 xl:grid-cols-3' // When chat is closed, use original breakpoints
          }`}>
            {/* Portfolio Chart - 2/3 width on xl screens, 3/5 on lg screens, full width on mobile */}
            <div className={`${
              sideChatVisible 
                ? '2xl:col-span-2' // When chat is open, take 2/3 of the 3-column grid
                : 'lg:col-span-3 xl:col-span-2' // When chat is closed, use original spans
            }`}>
              {accountId && (
                <PortfolioSummaryWithAssist
                  accountId={accountId}
                  portfolioHistory={portfolioHistory}
                  selectedTimeRange={selectedTimeRange}
                  setSelectedTimeRange={setSelectedTimeRange}
                  isLoading={isLoading}
                  disabled={!hasTradeHistory}
                  allTimeReturnAmount={null}
                  allTimeReturnPercent={null}
                />
              )}
            </div>

            {/* Analytics & Allocation - 1/3 width on xl screens, 2/5 on lg, full width on mobile - stacked vertically */}
            <div className={`space-y-3 lg:space-y-4 ${
              sideChatVisible 
                ? '2xl:col-span-1' // When chat is open, take 1/3 of the 3-column grid
                : 'lg:col-span-2 xl:col-span-1' // When chat is closed, use original spans
            }`}>
              {/* Portfolio Analytics (Risk & Diversification) - Compact */}
              <div className="h-fit">
                {!analytics && isLoading ? (
                  <RiskDiversificationScoresWithAssist
                    accountId={accountId}
                    initialData={analytics}
                    isLoading={true}
                    disabled={!hasTradeHistory}
                    skeletonContent={
                      <div className="space-y-2 lg:space-y-3">
                        <Skeleton className="h-14 lg:h-16 w-full" />
                        <Skeleton className="h-14 lg:h-16 w-full" />
                      </div>
                    }
                  />
                ) : analytics ? (
                  <RiskDiversificationScoresWithAssist
                    accountId={accountId}
                    initialData={analytics}
                    disabled={!hasTradeHistory}
                  />
                ) : (
                  <RiskDiversificationScoresWithAssist
                    accountId={accountId}
                    initialData={analytics}
                    disabled={!hasTradeHistory}
                    error={`Could not load analytics scores. ${error}`}
                  />
                )}
              </div>

              {/* Asset Allocation */}
              <div className="h-fit">
                {!isLoading && positions.length === 0 && !error ? (
                  <AssetAllocationPieWithAssist
                    positions={positions}
                    accountId={accountId}
                    refreshTimestamp={allocationChartRefreshKey}
                    disabled={!hasTradeHistory}
                    error="No positions available to display allocation."
                  />
                ) : isLoading && positions.length === 0 ? (
                  <AssetAllocationPieWithAssist
                    positions={positions}
                    accountId={accountId}
                    refreshTimestamp={allocationChartRefreshKey}
                    isLoading={true}
                    disabled={!hasTradeHistory}
                    skeletonContent={<Skeleton className="h-[220px] w-full" />}
                  />
                ) : positions.length > 0 ? (
                  <AssetAllocationPieWithAssist
                    positions={positions}
                    accountId={accountId}
                    refreshTimestamp={allocationChartRefreshKey}
                    disabled={!hasTradeHistory}
                  />
                ) : (
                  <AssetAllocationPieWithAssist
                    positions={positions}
                    accountId={accountId}
                    refreshTimestamp={allocationChartRefreshKey}
                    disabled={!hasTradeHistory}
                    error={`Could not load position data. ${error}`}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Row 2: Investment Growth Projection - Full Width */}
          <div className="w-full">
            <InvestmentGrowthWithAssist
              currentPortfolioValue={positions.reduce((sum, pos) => sum + (safeParseFloat(pos.market_value) ?? 0), 0)}
              isLoading={isLoading && positions.length === 0}
              disabled={!hasTradeHistory}
            />
          </div>

          {/* Row 3: Holdings and Transactions Tabs - Full Width */}
          <div className="w-full">
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-muted p-1 h-auto">
                <TabsTrigger value="holdings" className="py-2 data-[state=active]:bg-card data-[state=active]:shadow-md">Your Holdings</TabsTrigger>
                <TabsTrigger value="transactions" className="py-2 data-[state=active]:bg-card data-[state=active]:shadow-md">Pending Orders</TabsTrigger>
              </TabsList>

              <TabsContent value="holdings">
                {isLoading && positions.length === 0 && !error ? (
                  <Card className="bg-card shadow-lg mt-4">
                    <CardContent className="p-0">
                      <Skeleton className="h-64 w-full rounded-t-none" />
                    </CardContent>
                  </Card>
                ) : positions.length > 0 ? (
                  <HoldingsTableWithAssist 
                    positions={positions} 
                    isLoading={isLoading}
                    disabled={!hasTradeHistory}
                    onInvestClick={handleInvestClick}
                    onSellClick={handleSellClick}
                    accountId={accountId}
                  />
                ) : (
                  <Card className="bg-card shadow-lg mt-4">
                    <CardContent className="p-0">
                      <p className="text-muted-foreground p-6 text-center">
                        Waiting for your first trade to display holdings.
                      </p>
                    </CardContent>
                  </Card>
                )}
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
                        onOrderCancelled={handleOrderCancelled}
                      />
                    ) : (
                      <p className="text-muted-foreground p-6 text-center">
                        No pending orders.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Order Modal for Trade Actions */}
        {selectedSymbolForTrade && accountId && (
          <OrderModal
            isOpen={isOrderModalOpen}
            onClose={handleOrderModalClose}
            symbol={selectedSymbolForTrade}
            accountId={accountId}
            orderType={selectedOrderType}
            currentQuantity={selectedPosition?.qty}
            currentMarketValue={selectedPosition?.market_value}
          />
        )}

        {/* Toast notifications */}
        <Toaster 
          position="bottom-center"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#1f2937',
              color: '#fff',
              border: '1px solid #374151',
              borderRadius: '0.5rem',
              fontSize: '14px',
              padding: '12px 16px',
              zIndex: 99999,
              marginBottom: '100px', // Space above mobile bottom nav (80px + 20px margin)
            },
            className: 'mobile-toast',
            success: {
              iconTheme: {
                primary: '#10b981',
                secondary: '#fff',
              },
            },
            error: {
              iconTheme: {
                primary: '#ef4444',
                secondary: '#fff',
              },
            },
            loading: {
              iconTheme: {
                primary: '#6b7280',
                secondary: '#fff',
              },
            },
          }}
        />
      </div>
    </div>
  );
} 