'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { TrendingUp, AlertTriangle, Database } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useWeeklyStockPicks } from '@/hooks/useWeeklyStockPicks';

interface MarketEnvironmentProps {
  className?: string;
}

export default function MarketEnvironment({ className = "" }: MarketEnvironmentProps) {
  // Use the existing abstraction instead of duplicating API logic
  const { data, isLoading, error, isNewUser, isFallback, lastGenerated } = useWeeklyStockPicks();

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

  // Handle new user state (data being generated)
  if (isNewUser) {
    return (
      <Card className={`border-l-4 border-l-blue-500 ${className}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Current Market Environment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="default">
            <Database className="h-4 w-4" />
            <AlertDescription>
              Market analysis is being generated. Please check back soon.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Handle actual errors
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

  // Extract market analysis from the data
  const marketAnalysis = data?.market_analysis;
  
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
        {lastGenerated && (
          <div className="text-xs text-muted-foreground pt-2 border-t">
            Last updated: {new Date(lastGenerated).toLocaleString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
} 