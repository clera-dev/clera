'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { TrendingUp, AlertTriangle, RefreshCw, Database } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface MarketAnalysis {
  current_environment: string;
  risk_factors: string;
}

interface MarketEnvironmentProps {
  className?: string;
}

export default function MarketEnvironment({ className = "" }: MarketEnvironmentProps) {
  const [marketAnalysis, setMarketAnalysis] = useState<MarketAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Load market analysis from cached investment research
  const loadMarketAnalysis = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/investment/research', {
        method: 'GET',
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Market analysis data not available.');
        }
        const errorData = await response.json();
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success && result.data?.market_analysis) {
        setMarketAnalysis(result.data.market_analysis);
        setLastUpdated(new Date(result.metadata.generated_at).toLocaleString());
      } else {
        throw new Error('Market analysis not found in data');
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load market analysis';
      console.error('Failed to load market analysis:', errorMessage);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Load data on component mount
  useEffect(() => {
    loadMarketAnalysis();
  }, []);

  if (isLoading) {
    return (
      <Card className={`border-l-4 border-l-blue-500 ${className}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Current Market Environment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Skeleton className="h-5 w-32 mb-2" />
            <Skeleton className="h-16 w-full" />
          </div>
          <div>
            <Skeleton className="h-5 w-32 mb-2" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={`border-l-4 border-l-red-500 ${className}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Current Market Environment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {error}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!marketAnalysis) {
    return null;
  }

  return (
    <Card className={`border-l-4 border-l-blue-500 ${className}`}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            Current Market Environment
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="font-semibold mb-2 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-600" />
            Market Overview
          </h4>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {marketAnalysis.current_environment}
          </p>
        </div>
        <div>
          <h4 className="font-semibold mb-2 flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Risk Factors to Monitor
          </h4>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {marketAnalysis.risk_factors}
          </p>
        </div>
      </CardContent>
    </Card>
  );
} 