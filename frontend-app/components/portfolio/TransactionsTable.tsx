"use client";

import React, { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO } from 'date-fns';

// Re-use or import the OrderData interface from page.tsx or a shared types file
interface OrderData {
  id: string; 
  client_order_id: string;
  created_at: string; 
  filled_at?: string | null;
  symbol: string;
  asset_class: string;
  notional?: string | null; 
  qty?: string | null; 
  filled_qty?: string | null; 
  filled_avg_price?: string | null; 
  order_type: string;
  type: string;
  side: string;
  time_in_force: string;
  limit_price?: string | null; 
  stop_price?: string | null; 
  status: string;
  commission?: string | null;
}

interface TransactionsTableProps {
  initialOrders: OrderData[];
  accountId: string | null;
  // apiKey: string | null; // Remove apiKey requirement
  // Pass the fetchData function from the parent to handle API calls with auth
  fetchData: (endpoint: string, options?: RequestInit) => Promise<any>;
  isLoading?: boolean; // Optional loading state from parent
}

// Helper to format date/time
const formatDateTime = (dateString: string | null | undefined): string => {
    if (!dateString) return '--';
    try {
        return format(parseISO(dateString), 'MMM dd, yyyy HH:mm');
    } catch (e) {
        return 'Invalid Date';
    }
};

// Helper to format currency
const formatCurrency = (value: string | null | undefined, digits = 2): string => {
    if (value === null || value === undefined) return '$--.--';
    const numericValue = parseFloat(value);
    if (isNaN(numericValue)) return '$--.--';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    }).format(numericValue);
};

// Map status to badge variant
const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline"  => {
    switch (status) {
        case 'filled':
            return 'default';
        case 'partially_filled':
            return 'secondary';
        case 'canceled':
        case 'expired':
            return 'secondary';
        case 'rejected':
        case 'failed':
            return 'destructive';
        case 'new':
        case 'pending_new':
        case 'accepted':
        case 'pending_cancel':
        case 'pending_replace':
            return 'outline';
        default:
            return 'default';
    }
};

const TransactionsTable: React.FC<TransactionsTableProps> = ({ initialOrders, accountId, fetchData, isLoading: parentLoading }) => {
    const [orders, setOrders] = useState<OrderData[]>(initialOrders);
    const [isLoading, setIsLoading] = useState<boolean>(parentLoading || false);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [hasNextPage, setHasNextPage] = useState(initialOrders.length >= 50); // Assume true if we have 50+ initial orders

    // Effect to update orders if initialOrders prop changes
    useEffect(() => {
        setOrders(initialOrders);
        setIsLoading(parentLoading || false);
        setHasNextPage(initialOrders.length >= 50);
        setCurrentPage(1);
    }, [initialOrders, parentLoading]);

    const loadMoreOrders = async () => {
        if (!accountId) return;
        setIsLoading(true);
        setError(null);
        try {
            // Get the oldest order's timestamp to use as 'before' parameter
            const oldestOrder = orders[orders.length - 1];
            const beforeTimestamp = oldestOrder?.created_at;
            
            // Build the endpoint with pagination
            const endpoint = `/api/portfolio/orders?accountId=${accountId}&status=all&limit=50&direction=desc${beforeTimestamp ? `&until=${beforeTimestamp}` : ''}`;
            
            const newOrders = await fetchData(endpoint);
            
            // If we got back fewer than 50 orders, assume we've reached the end
            setHasNextPage(newOrders.length >= 50);
            
            // Avoid duplicates by filtering out orders we already have
            const existingIds = new Set(orders.map(order => order.id));
            const uniqueNewOrders = newOrders.filter((order: OrderData) => !existingIds.has(order.id));
            
            setOrders(prev => [...prev, ...uniqueNewOrders]);
            setCurrentPage(prev => prev + 1);
        } catch (err: any) {
            setError(`Failed to load more transactions: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading && orders.length === 0) {
        return (
            <div className="p-4">
                <Skeleton className="h-8 w-full mb-4" />
                <Skeleton className="h-8 w-full mb-2" />
                <Skeleton className="h-8 w-full mb-2" />
                <Skeleton className="h-8 w-full mb-2" />
            </div>
        );
    }

    if (error && orders.length === 0) {
      return <p className="text-destructive p-6 text-center">Error loading transactions: {error}</p>;
    }

    if (!orders || orders.length === 0) {
      return <p className="text-muted-foreground p-6 text-center">No transactions found.</p>;
    }

    return (
        <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date Filled</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Avg Price</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => {
                  const filledQty = parseFloat(order.filled_qty || '0');
                  const avgPrice = parseFloat(order.filled_avg_price || '0');
                  const amount = filledQty * avgPrice; // Simple amount, might differ based on fees/commission

                  return (
                    <TableRow key={order.id}>
                      <TableCell>{formatDateTime(order.filled_at || order.created_at)}</TableCell>
                      <TableCell className="font-medium">{order.symbol}</TableCell>
                      <TableCell>
                         <span className={`capitalize ${order.side === 'buy' ? 'text-green-500' : 'text-red-500'}`}>
                            {order.side}
                         </span>
                      </TableCell>
                      <TableCell>{order.filled_qty || order.qty}</TableCell>
                      <TableCell>{formatCurrency(order.filled_avg_price)}</TableCell>
                      <TableCell>{formatCurrency(amount.toString())}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={getStatusVariant(order.status)} className="capitalize">
                          {order.status.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {hasNextPage && (
                <div className="text-center p-4">
                    <Button onClick={loadMoreOrders} disabled={isLoading} variant="outline" size="sm">
                        {isLoading ? "Loading..." : "Load More"}
                    </Button>
                </div>
            )}
            {error && orders.length > 0 && (
                <p className="text-destructive p-2 text-center text-sm">
                    {error}
                </p>
            )}
        </>
    );
};

export default TransactionsTable; 