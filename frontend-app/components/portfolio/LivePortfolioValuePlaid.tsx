"use client";

import React, { useState, useEffect, useRef } from 'react';
import { ArrowUpRight, ArrowDownRight, Clock, Building2, ChevronDown } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createClient } from '@/utils/supabase/client';

interface LivePortfolioPlaidProps {
  accountId: string | null;
  userId: string;
  onRefresh?: () => void;
  refreshTrigger?: number;
  selectedAccountFilter?: 'total' | string;
  onAccountFilterChange?: (accountId: 'total' | string) => void;
  availableAccounts?: any[];
}

interface LivePortfolioData {
  tracking_active: boolean;
  total_value: number;
  intraday_change: number;
  intraday_change_percent: number;
  today_high: number;
  today_low: number;
  account_breakdown: Record<string, number>;
  last_update: string;
  market_hours: boolean;
}

interface AccountBreakdownData {
  account_id: string;
  account_name: string;
  account_type: string;
  account_subtype: string;
  institution_name: string;
  portfolio_value: number;
  percentage: number;
}

export default function LivePortfolioValuePlaid({ 
  accountId, 
  userId,
  onRefresh,
  refreshTrigger,
  selectedAccountFilter = 'total',
  onAccountFilterChange,
  availableAccounts = []
}: LivePortfolioPlaidProps) {
  const [portfolioData, setPortfolioData] = useState<LivePortfolioData | null>(null);
  const [accountBreakdown, setAccountBreakdown] = useState<AccountBreakdownData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [websocketConnected, setWebsocketConnected] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);
  const [showAccountBreakdown, setShowAccountBreakdown] = useState(false);

  const websocketRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const supabase = createClient();
  const maxReconnectAttempts = 5;

  // Initialize live tracking when component mounts
  useEffect(() => {
    if (userId) {
      initializeLiveTracking();
    }

    return () => {
      cleanup();
    };
  }, [userId]);

  // Handle manual refresh
  useEffect(() => {
    if (refreshTrigger) {
      handleManualRefresh();
    }
  }, [refreshTrigger]);

  const initializeLiveTracking = async () => {
    try {
      setError(null);
      setIsLoading(true);

      // Start live tracking via API
      const response = await fetch('/api/portfolio/live-tracking/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to start live tracking: ${response.status}`);
      }

      const result = await response.json();

      console.log('📊 Live tracking start response:', result);

      // Handle different response formats from backend
      if (result.success || result.status === 'active' || result.tracking_active) {
        // Set initial portfolio data from response
        const portfolioValue = result.initial_value || result.total_value || 0;
        const intradayChange = result.intraday_change || 0;
        const intradayChangePercent = result.intraday_change_percent || 0;
        
        setPortfolioData({
          tracking_active: true,
          total_value: portfolioValue,
          intraday_change: intradayChange,
          intraday_change_percent: intradayChangePercent,
          today_high: result.today_high || portfolioValue,
          today_low: result.today_low || portfolioValue,
          account_breakdown: result.account_breakdown || {},
          last_update: result.last_update || new Date().toISOString(),
          market_hours: result.market_hours !== undefined ? result.market_hours : true
        });

        setLastUpdateTime(new Date());

        // Connect WebSocket for live updates
        await connectWebSocket();

        // Load account breakdown
        loadAccountBreakdown();
      } else if (result.status === 'partial' || result.status === 'no_holdings') {
        // Partial tracking or no holdings - fallback to basic display
        console.log('⚠️ Partial live tracking:', result.message);
        
        // Try to get basic portfolio value from aggregated service
        const valueResponse = await fetch('/api/portfolio/value?accountId=aggregated&user_id=' + userId);
        if (valueResponse.ok) {
          const valueData = await valueResponse.json();
          setPortfolioData({
            tracking_active: false,
            total_value: valueData.raw_value || 0,
            intraday_change: valueData.raw_return || 0,
            intraday_change_percent: valueData.raw_return_percent || 0,
            today_high: valueData.raw_value || 0,
            today_low: valueData.raw_value || 0,
            account_breakdown: {},
            last_update: new Date().toISOString(),
            market_hours: false
          });
        }
        
        // Still load account breakdown
        loadAccountBreakdown();
      } else {
        throw new Error(result.error || result.message || 'Failed to initialize live tracking');
      }

    } catch (err) {
      console.error('Error initializing live tracking:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const connectWebSocket = async () => {
    try {
      // Get Supabase authentication token
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.access_token) {
        console.error('WebSocket Auth Error: Could not get session or access token.', sessionError);
        setError('Authentication failed for live tracking');
        return;
      }
      
      // For aggregation mode, use "aggregated" as account identifier instead of Alpaca account ID
      const wsAccountId = "aggregated"; // Aggregation mode uses special identifier
      const wsUrl = `ws://localhost:8001/ws/portfolio/${wsAccountId}?token=${encodeURIComponent(session.access_token)}`;
      websocketRef.current = new WebSocket(wsUrl);

      websocketRef.current.onopen = () => {
        console.log('🔌 WebSocket connected for live portfolio tracking');
        setWebsocketConnected(true);
        reconnectAttempts.current = 0;
      };

      websocketRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'portfolio_update' && message.data) {
            const updateData = message.data;
            
            setPortfolioData({
              tracking_active: true,
              total_value: updateData.total_value,
              intraday_change: updateData.intraday_change,
              intraday_change_percent: updateData.intraday_change_percent,
              today_high: updateData.today_high,
              today_low: updateData.today_low,
              account_breakdown: updateData.account_breakdown || {},
              last_update: updateData.timestamp,
              market_hours: updateData.market_hours
            });

            setLastUpdateTime(new Date());
            
            console.log(`📊 Live portfolio update: $${updateData.total_value.toFixed(2)} (${updateData.intraday_change_percent > 0 ? '+' : ''}${updateData.intraday_change_percent.toFixed(2)}%)`);
          }
        } catch (err) {
          console.error('Error processing WebSocket message:', err);
        }
      };

      websocketRef.current.onerror = (event) => {
        console.error('WebSocket error:', event);
        setWebsocketConnected(false);
      };

      websocketRef.current.onclose = () => {
        console.log('🔌 WebSocket disconnected');
        setWebsocketConnected(false);
        
        // Attempt reconnection with exponential backoff
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.pow(2, reconnectAttempts.current) * 1000; // 1s, 2s, 4s, 8s, 16s
          setTimeout(async () => {
            reconnectAttempts.current++;
            console.log(`🔄 Attempting WebSocket reconnection (${reconnectAttempts.current}/${maxReconnectAttempts})`);
            await connectWebSocket();
          }, delay);
        }
      };

    } catch (err) {
      console.error('Error connecting WebSocket:', err);
      setWebsocketConnected(false);
    }
  };

  const loadAccountBreakdown = async () => {
    try {
      const response = await fetch('/api/portfolio/account-breakdown');
      
      if (response.ok) {
        const result = await response.json();
        setAccountBreakdown(result.account_breakdown || []);
      }
    } catch (err) {
      console.error('Error loading account breakdown:', err);
    }
  };

  const handleManualRefresh = async () => {
    try {
      // Refresh current portfolio data
      const response = await fetch('/api/portfolio/live-tracking/status');
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.tracking_active) {
          setPortfolioData({
            tracking_active: data.tracking_active,
            total_value: data.total_value,
            intraday_change: data.intraday_change,
            intraday_change_percent: data.intraday_change_percent,
            today_high: data.today_high,
            today_low: data.today_low,
            account_breakdown: data.account_breakdown || {},
            last_update: data.last_update,
            market_hours: data.market_hours
          });
          
          setLastUpdateTime(new Date());
        }
      }

      // Reload account breakdown
      loadAccountBreakdown();
      onRefresh?.();

    } catch (err) {
      console.error('Error refreshing portfolio data:', err);
    }
  };

  const cleanup = async () => {
    // Close WebSocket connection
    if (websocketRef.current) {
      websocketRef.current.close();
      websocketRef.current = null;
    }

    // Stop live tracking
    try {
      await fetch('/api/portfolio/live-tracking/stop', {
        method: 'DELETE'
      });
    } catch (err) {
      console.error('Error stopping live tracking:', err);
    }
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    
    if (diffSeconds < 10) return 'Just now';
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    
    const diffMins = Math.floor(diffSeconds / 60);
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h ago`;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  if (isLoading && !portfolioData) {
    return (
      <div className="space-y-4">
        <div className="h-6 bg-muted animate-pulse rounded w-1/2" />
        <div className="h-10 bg-muted animate-pulse rounded w-3/4" />
        <div className="h-4 bg-muted animate-pulse rounded w-1/3" />
      </div>
    );
  }

  if (error && !portfolioData) {
    return (
      <div className="text-center py-6">
        <p className="text-destructive mb-4">Portfolio tracking temporarily unavailable</p>
        <Button onClick={initializeLiveTracking} variant="outline" size="sm">
          Try Again
        </Button>
      </div>
    );
  }

  if (!portfolioData) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <p>Portfolio tracking not available</p>
      </div>
    );
  }

  const isPositiveChange = portfolioData.intraday_change >= 0;
  const changeColor = isPositiveChange ? 'text-green-600' : 'text-red-600';
  const ChangeArrowIcon = isPositiveChange ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="space-y-3">
      {/* Account Selector for X-Ray Vision */}
      <div className="space-y-2">
        {availableAccounts.length > 1 ? (
          <Select value={selectedAccountFilter} onValueChange={onAccountFilterChange}>
            <SelectTrigger className="w-full border-0 bg-transparent p-0 h-auto hover:bg-accent/50 rounded-lg">
              <div className="flex items-center justify-between w-full p-2">
                <div className="text-left">
                  <div className="text-xs text-muted-foreground mb-1">
                    {selectedAccountFilter === 'total' ? 'Total Portfolio' : 
                     availableAccounts.find(acc => (acc.uuid || acc.account_id) === selectedAccountFilter)?.account_type?.toUpperCase() + ' • ' +
                     availableAccounts.find(acc => (acc.uuid || acc.account_id) === selectedAccountFilter)?.institution_name}
                  </div>
                  <div className="text-2xl md:text-3xl font-bold">
                    {formatCurrency(selectedAccountFilter === 'total' ? 
                      portfolioData.total_value :
                      availableAccounts.find(acc => (acc.uuid || acc.account_id) === selectedAccountFilter)?.portfolio_value || 0)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </SelectTrigger>
            
            <SelectContent>
              <SelectItem value="total">
                <div className="flex items-center justify-between w-full min-w-[300px]">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <div>
                      <div className="font-medium">Total Portfolio</div>
                      <div className="text-xs text-muted-foreground">All accounts</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{formatCurrency(portfolioData.total_value)}</div>
                    <div className="text-xs text-muted-foreground">100%</div>
                  </div>
                </div>
              </SelectItem>
              
              {availableAccounts.map((account) => (
                <SelectItem key={account.uuid || account.account_id} value={account.uuid || account.account_id}>
                  <div className="flex items-center justify-between w-full min-w-[300px]">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <div>
                        <div className="font-medium">{account.account_type?.toUpperCase()}</div>
                        <div className="text-xs text-muted-foreground">{account.institution_name}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{formatCurrency(account.portfolio_value)}</div>
                      <div className="text-xs text-muted-foreground">{((account.portfolio_value / portfolioData.total_value) * 100).toFixed(1)}%</div>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          // Single account or no accounts - show simple display
          <div className="flex items-center justify-between">
            <span className="text-2xl md:text-3xl font-bold">
              {formatCurrency(portfolioData.total_value)}
            </span>
          </div>
        )}
      </div>

      {/* Today's Change - Only show for total portfolio (individual account intraday change not available yet) */}
      {selectedAccountFilter === 'total' && (
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Today's Change</p>
          <div className="flex items-center gap-2">
            <ChangeArrowIcon className={`h-4 w-4 ${changeColor}`} />
            <span className={`text-lg font-semibold ${changeColor}`}>
              {formatCurrency(Math.abs(portfolioData.intraday_change))} ({isPositiveChange ? '+' : ''}{portfolioData.intraday_change_percent.toFixed(2)}%)
            </span>
          </div>
        </div>
      )}



      {/* Connection Issues */}
      {!websocketConnected && portfolioData.tracking_active && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
          <p className="text-xs text-orange-700">
            🔄 <strong>Reconnecting...</strong><br />
            Live updates temporarily interrupted.
          </p>
        </div>
      )}
    </div>
  );
}
