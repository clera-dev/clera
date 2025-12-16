"use client";

import React, { useState, useEffect } from 'react';
import { ArrowUpRight, ArrowDownRight, RefreshCw, Clock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface StaticPortfolioValueProps {
  accountId: string | null;
  onRefresh?: () => void;
  refreshTrigger?: number;
  onHistoryReady?: () => void;
}

interface PortfolioValueData {
  total_value: string;
  today_return: string;
  raw_value: number;
  raw_return: number;
  raw_return_percent: number;
  timestamp: string;
  data_source: string;
}

export default function StaticPortfolioValue({ 
  accountId, 
  onRefresh,
  refreshTrigger,
  onHistoryReady
}: StaticPortfolioValueProps) {
  const [portfolioValue, setPortfolioValue] = useState<PortfolioValueData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Reconstruction status tracking
  const [reconstructionStatus, setReconstructionStatus] = useState<string>('checking');
  const [reconstructionProgress, setReconstructionProgress] = useState<number>(0);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [hasTriggeredReconstruction, setHasTriggeredReconstruction] = useState<boolean>(false);
  const [hasNotifiedHistoryReady, setHasNotifiedHistoryReady] = useState<boolean>(false);

  const checkReconstructionStatus = async () => {
    try {
      const response = await fetch('/api/portfolio/reconstruction/status');
      
      if (response.ok) {
        const status = await response.json();
        setReconstructionStatus(status.status);
        setReconstructionProgress(status.progress || 0);
        setProgressMessage(status.message || '');
        
        // If reconstruction is complete, signal for live tracking upgrade (ONLY ONCE)
        if (status.status === 'completed' && !hasNotifiedHistoryReady) {
          setHasNotifiedHistoryReady(true);
          onHistoryReady?.();
        }
        
        return status;
      } else {
        // If 404, reconstruction not started - trigger it (ONLY ONCE)
        if (response.status === 404 && !hasTriggeredReconstruction) {
          setReconstructionStatus('not_started');
          setHasTriggeredReconstruction(true);
          await triggerReconstruction();
        }
      }
    } catch (err) {
      console.error('Error checking reconstruction status:', err);
      // Continue with portfolio value fetching as fallback
      setReconstructionStatus('error');
    }
  };

  const triggerReconstruction = async () => {
    try {
      setReconstructionStatus('starting');
      setProgressMessage('Starting portfolio history reconstruction...');
      
      const response = await fetch('/api/portfolio/reconstruction/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ priority: 'high' })
      });

      if (response.ok) {
        const result = await response.json();
        setReconstructionStatus(result.status);
        setProgressMessage(result.message);
        
        // Start polling for progress updates
        startProgressPolling();
      }
    } catch (err) {
      console.error('Error triggering reconstruction:', err);
      setReconstructionStatus('error');
      setProgressMessage('Failed to start portfolio history reconstruction');
    }
  };

  const startProgressPolling = () => {
    let pollCount = 0;
    const maxPolls = 150; // 150 polls × 2 seconds = 5 minutes max
    
    const pollInterval = setInterval(async () => {
      pollCount++;
      
      try {
        const response = await fetch('/api/portfolio/reconstruction/status');
        if (response.ok) {
          const status = await response.json();
          setReconstructionStatus(status.status);
          setReconstructionProgress(status.progress || 0);
          setProgressMessage(status.message || '');
          
          // Stop polling if completed or failed
          if (status.status === 'completed' || status.status === 'failed') {
            clearInterval(pollInterval);
            
            if (status.status === 'completed' && !hasNotifiedHistoryReady) {
              setHasNotifiedHistoryReady(true);
              onHistoryReady?.();
            }
          }
        } else {
          // Stop polling on persistent API errors
          if (response.status >= 500) {
            console.warn('Stopping polling due to API errors');
            clearInterval(pollInterval);
            setReconstructionStatus('error');
            setProgressMessage('API temporarily unavailable');
          }
        }
      } catch (err) {
        console.error('Error polling reconstruction status:', err);
        // Stop polling after repeated errors
        if (pollCount > 5) {
          clearInterval(pollInterval);
          setReconstructionStatus('error');
          setProgressMessage('Unable to check progress');
        }
      }
      
      // Stop polling after max attempts
      if (pollCount >= maxPolls) {
        clearInterval(pollInterval);
        setReconstructionStatus('error');
        setProgressMessage('Reconstruction timeout');
      }
    }, 2000); // Poll every 2 seconds during reconstruction
  };

  const fetchPortfolioValue = async () => {
    if (!accountId) return;

    try {
      setError(null);

      const response = await fetch(`/api/portfolio/value?accountId=${accountId}`, {
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch portfolio value: ${response.status}`);
      }

      const data = await response.json();
      setPortfolioValue(data);

    } catch (err) {
      console.error('Error fetching portfolio value:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  // Initialize on mount
  useEffect(() => {
    const initialize = async () => {
      // Always fetch portfolio value first
      await fetchPortfolioValue();
      
      // Then check reconstruction status (with fallback if API fails)
      try {
        await checkReconstructionStatus();
      } catch (err) {
        console.debug('Reconstruction status check failed, using fallback display');
        setReconstructionStatus('error');
        setProgressMessage('Using current portfolio data');
      }
    };
    initialize();
  }, [accountId]);

  // Handle manual refresh
  useEffect(() => {
    if (refreshTrigger) {
      fetchPortfolioValue();
      onRefresh?.();
    }
  }, [refreshTrigger]);

  // Show reconstruction progress if building history
  if (reconstructionStatus === 'in_progress' || reconstructionStatus === 'starting' || reconstructionStatus === 'queued') {
    return (
      <div className="text-center py-8 space-y-4">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
        <div className="space-y-2">
          <h3 className="font-semibold">Building Your Portfolio History</h3>
          <p className="text-muted-foreground">Analyzing your investment timeline from the past 2 years...</p>
          
          {reconstructionProgress > 0 && (
            <div className="w-full bg-blue-100 rounded-full h-2 mt-4">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-500" 
                style={{ width: `${reconstructionProgress}%` }}
              ></div>
            </div>
          )}
          
          <p className="text-sm text-muted-foreground mt-2">
            {progressMessage || 'This usually takes 2-3 minutes'}
          </p>
        </div>
      </div>
    );
  }

  // Show error state (but still show portfolio value if available)
  if ((reconstructionStatus === 'failed' || error) && !portfolioValue) {
    return (
      <div className="text-center py-6">
        <p className="text-destructive mb-4">
          {reconstructionStatus === 'failed' 
            ? 'Unable to build portfolio history' 
            : 'Failed to load portfolio value'
          }
        </p>
        <Button onClick={() => fetchPortfolioValue()} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
      </div>
    );
  }

  // Loading state
  if (isLoading && !portfolioValue) {
    return (
      <div className="space-y-4">
        <div className="h-6 bg-muted animate-pulse rounded w-1/2" />
        <div className="h-10 bg-muted animate-pulse rounded w-3/4" />
        <div className="h-4 bg-muted animate-pulse rounded w-1/3" />
      </div>
    );
  }

  if (!portfolioValue) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <p>Portfolio value not available</p>
      </div>
    );
  }

  const isPositiveReturn = portfolioValue.raw_return >= 0;
  const returnColor = isPositiveReturn ? 'text-green-600' : 'text-red-600';
  const ArrowIcon = isPositiveReturn ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="space-y-4">
      {/* Portfolio Value Display */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">Portfolio Value</h3>
        
        <div className="flex items-center justify-between">
          <span className="text-2xl md:text-3xl font-bold">{portfolioValue.total_value}</span>
          <Button 
            onClick={() => fetchPortfolioValue()} 
            variant="ghost" 
            size="sm"
            disabled={isLoading}
            className="text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Today's Return */}
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">Today's Change</p>
        <div className="flex items-center gap-2">
          <ArrowIcon className={`h-4 w-4 ${returnColor}`} />
          <span className={`text-lg font-semibold ${returnColor}`}>
            {portfolioValue.today_return}
          </span>
        </div>
      </div>
    </div>
  );
}
