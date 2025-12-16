"use client";

import React from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Building2, TrendingUp, PieChart, Filter } from "lucide-react";

interface PositionData {
  symbol: string;
  market_value: string;
  data_source?: string;
  institutions?: string[];
  account_breakdown?: Array<{
    account_id: string;
    institution: string;
    market_value: number;
    quantity: number;
  }>;
  source_metadata?: {
    provider: string;
    aggregated_across_accounts: boolean;
    can_trade: boolean;
    is_external: boolean;
  };
}

interface SourceSummary {
  external: {
    count: number;
    value: number;
    institutions: string[];
  };
  clera: {
    count: number;
    value: number;
  };
}

interface PortfolioSourceFilterProps {
  positions: PositionData[];
  activeFilter: 'all' | 'external' | 'clera';
  onFilterChange: (filter: 'all' | 'external' | 'clera') => void;
  showPerAccountView?: boolean;
  onPerAccountToggle?: (show: boolean) => void;
  className?: string;
}

export default function PortfolioSourceFilter({
  positions = [],
  activeFilter = 'all',
  onFilterChange,
  showPerAccountView = false,
  onPerAccountToggle,
  className = ""
}: PortfolioSourceFilterProps) {
  
  // Calculate source summary
  const sourceSummary: SourceSummary = React.useMemo(() => {
    const external = positions.filter(p => p.data_source === 'external');
    const clera = positions.filter(p => p.data_source === 'clera');
    
    const externalInstitutions = Array.from(
      new Set(external.flatMap(p => p.institutions || []))
    );
    
    return {
      external: {
        count: external.length,
        value: external.reduce((sum, p) => sum + parseFloat(p.market_value || '0'), 0),
        institutions: externalInstitutions
      },
      clera: {
        count: clera.length,
        value: clera.reduce((sum, p) => sum + parseFloat(p.market_value || '0'), 0)
      }
    };
  }, [positions]);
  
  // Check if we have multiple sources (future hybrid mode)
  const hasMultipleSources = sourceSummary.external.count > 0 && sourceSummary.clera.count > 0;
  
  // Don't render if only one source (current state)
  if (!hasMultipleSources && activeFilter === 'all') {
    return null;
  }

  return (
    <Card className={`bg-card shadow-sm border ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Portfolio Sources
          </div>
          {onPerAccountToggle && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPerAccountToggle(!showPerAccountView)}
              className="text-xs"
            >
              <PieChart className="h-3 w-3 mr-1" />
              {showPerAccountView ? 'Aggregated View' : 'Per-Account View'}
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Source Filter Tabs */}
        <Tabs value={activeFilter} onValueChange={(value) => onFilterChange(value as 'all' | 'external' | 'clera')} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="all" className="text-xs">
              All Sources
              <Badge variant="secondary" className="ml-2 text-xs">
                {positions.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="external" className="text-xs">
              External
              <Badge variant="secondary" className="ml-2 text-xs">
                {sourceSummary.external.count}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="clera" className="text-xs">
              Clera
              <Badge variant="secondary" className="ml-2 text-xs">
                {sourceSummary.clera.count}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Source Summary */}
        <div className="grid grid-cols-1 gap-3">
          {sourceSummary.external.count > 0 && (
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-500" />
                <div>
                  <p className="font-medium text-sm">External Accounts</p>
                  <p className="text-xs text-muted-foreground">
                    {sourceSummary.external.institutions.join(', ')}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold">${sourceSummary.external.value.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{sourceSummary.external.count} positions</p>
              </div>
            </div>
          )}

          {sourceSummary.clera.count > 0 && (
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                <div>
                  <p className="font-medium text-sm">Clera Brokerage</p>
                  <p className="text-xs text-muted-foreground">Tradeable positions</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold">${sourceSummary.clera.value.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{sourceSummary.clera.count} positions</p>
              </div>
            </div>
          )}
        </div>

        {/* Per-Account Breakdown (Future Feature) */}
        {showPerAccountView && (
          <div className="border-t pt-3">
            <p className="text-sm font-medium mb-2">Per-Account Breakdown:</p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {positions
                .filter(p => {
                  if (activeFilter === 'external') return p.data_source === 'external';
                  if (activeFilter === 'clera') return p.data_source === 'clera';
                  return true;
                })
                .flatMap(position => 
                  position.account_breakdown?.map(account => ({
                    ...account,
                    symbol: position.symbol,
                    data_source: position.data_source
                  })) || []
                )
                .map((account, index) => (
                  <div key={index} className="flex items-center justify-between p-2 rounded border text-xs">
                    <div>
                      <p className="font-medium">{account.symbol}</p>
                      <p className="text-muted-foreground">{account.institution}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">${account.market_value.toLocaleString()}</p>
                      <p className="text-muted-foreground">{account.quantity} shares</p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
