"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { TrendingUp } from "lucide-react";
import { 
  formatTransferStatus, 
  formatTransferDate 
} from "@/lib/utils/transfer-formatting";
import { 
  getTransferStatusIcon, 
  getTransferStatusColorClasses 
} from "@/components/ui/transfer-ui-utils";

interface TransferHistoryItem {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  updated_at?: string;
  last_4?: string;
}

interface TransferHistoryProps {
  // No props needed - parent uses key prop to force refresh
}

// All utility functions moved to @/lib/utils/transfer-formatting

export default function TransferHistory() {
  const [transfers, setTransfers] = useState<TransferHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const syncTransferStatuses = async () => {
    try {
      await fetch('/api/broker/sync-transfer-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      // Don't throw on sync errors - it's optional
    } catch (error) {
      console.warn('Transfer status sync failed (non-critical):', error);
    }
  };

  const fetchTransferHistory = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // First, try to sync transfer statuses (non-blocking)
      await syncTransferStatuses();

      const response = await fetch('/api/broker/transfer-history', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch transfer history: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success) {
        setTransfers(data.transfers || []);
        console.log(`Transfer History: Loaded ${data.transfers?.length || 0} transfers from ${data.source || 'unknown'} source`);
      } else {
        throw new Error(data.error || 'Failed to fetch transfers');
      }
    } catch (error) {
      console.error('Error fetching transfer history:', error);
      setError(error instanceof Error ? error.message : 'Failed to load transfer history');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTransferHistory();
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Transfer History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Transfer History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-red-600 dark:text-red-400 mb-2">{error}</p>
            <button 
              onClick={fetchTransferHistory}
              className="text-blue-600 hover:text-blue-800 underline"
            >
              Try again
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (transfers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Transfer History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">No transfers found</p>
            <p className="text-sm text-muted-foreground mt-1">
              Your completed transfers will appear here
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Transfer History
          </CardTitle>
          {/* Chevron on mobile to expand/collapse */}
          {isMobile && (
            <button
              type="button"
              aria-label={expanded ? 'Collapse' : 'Expand'}
              onClick={() => setExpanded((e) => !e)}
              className="p-2 -mr-1 rounded-md hover:bg-accent/30 transition-colors"
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </CardHeader>
      {(!isMobile || expanded) && (
        <CardContent>
          {/* On mobile, let the page scroll; prevent nested scroll traps */}
          <ScrollArea className="h-auto max-h-none pr-0 lg:h-[300px] lg:pr-4">
            <div className="space-y-3">
            {transfers.map((transfer, index) => {
              const initiated = formatTransferDate(transfer.created_at);
              const completed = transfer.updated_at ? formatTransferDate(transfer.updated_at) : null;
              
              return (
                <div
                  key={transfer.id || index}
                  className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0">
                      {getTransferStatusIcon(transfer.status)}
                    </div>
                    <div className="flex-grow min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-foreground">
                          {`$${transfer.amount.toFixed(2)}`}
                        </p>
                        <Badge className={`text-xs ${getTransferStatusColorClasses(transfer.status)}`}>
                          {formatTransferStatus(transfer.status)}
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">
                          Initiated: {initiated.date} at {initiated.time}
                        </p>
                        {completed && (
                          <p className="text-sm text-muted-foreground">
                            Completed: {completed.date} at {completed.time}
                          </p>
                        )}
                        {transfer.last_4 && (
                          <p className="text-sm text-muted-foreground">
                            Account: ••••{transfer.last_4}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          </ScrollArea>
        </CardContent>
      )}
    </Card>
  );
} 