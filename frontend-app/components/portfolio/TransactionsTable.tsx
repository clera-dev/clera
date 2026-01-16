"use client";

import React, { useState, useEffect, useCallback } from 'react';
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
import { Copy, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { OrderCancelModal } from "@/components/ui/order-cancel-modal";
import toast from 'react-hot-toast';

// Re-use or import the OrderData interface from page.tsx or a shared types file
interface OrderData {
  id: string; 
  client_order_id?: string;
  created_at?: string;
  date?: string; // For activities that use date instead of created_at 
  submitted_at?: string | null;
  updated_at?: string | null;
  filled_at?: string | null;
  symbol?: string;
  asset_class?: string;
  notional?: string | null; 
  notional_value?: number; // For queued orders
  qty?: string | null; 
  quantity?: number; // For SnapTrade orders
  filled_qty?: string | null; 
  filled_avg_price?: string | null; 
  order_type?: string;
  type?: string;
  side?: string;
  time_in_force?: string;
  limit_price?: string | null; 
  stop_price?: string | null; 
  price?: number | null; // For SnapTrade orders
  status?: string;
  commission?: string | null;
  account_name?: string; // For SnapTrade orders: Brokerage name (e.g., "Webull")
  account_id?: string; // For SnapTrade orders
  // Queued order fields (orders placed when market was closed)
  is_queued?: boolean;
  queued_message?: string;
  cancellation_reason?: string | null;
  last_error?: string | null;
  // Activity fields
  activity_type?: string;
  net_amount?: string;
  description?: string;
}

interface TransactionsTableProps {
  initialOrders: OrderData[];
  accountId: string | null;
  fetchData: (endpoint: string, options?: RequestInit) => Promise<any>;
  isLoading?: boolean; // Optional loading state from parent
  onOrderCancelled?: (cancelledOrderId: string) => void; // Callback when order is cancelled
}

// Helper to format date/time
const formatDateTime = (dateString: string | null | undefined): string => {
    if (!dateString) return '--';
    try {
        return format(parseISO(dateString), 'yyyy-MM-dd HH:mm');
    } catch (e) {
        return 'Invalid Date';
    }
};

// Helper to format currency
const formatCurrency = (value: string | number | null | undefined, digits = 2): string => {
    if (value === null || value === undefined) return '$--.--';
    
    let numericValue: number;
    if (typeof value === 'string') {
        numericValue = parseFloat(value);
    } else {
        numericValue = value;
    }
    
    if (isNaN(numericValue)) return '$--.--';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    }).format(numericValue);
};

// Map status to badge variant
const getStatusVariant = (status: string | undefined, activityType?: string): "default" | "secondary" | "destructive" | "outline"  => {
    // Handle activities
    if (activityType) {
        switch (activityType) {
            case 'FILL':
            case 'DIV':
            case 'ACATC':
            case 'DEP':
                return 'default'; // Completed activities
            case 'CSD':
            case 'CSW':
                return 'secondary'; // Cash operations
            default:
                return 'outline';
        }
    }
    
    // Handle orders
    if (!status) return 'outline';
    
    switch (status) {
        case 'filled':
            return 'default';
        case 'partially_filled':
            return 'secondary';
        case 'canceled':
        case 'cancelled':
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

// Get transaction type based on order or activity
const getTransactionType = (item: OrderData): string => {
    // Handle activities
    if (item.activity_type) {
        switch (item.activity_type) {
            case 'FILL':
                return item.side?.toLowerCase() === 'buy' ? 'Buy' : 'Sell';
            case 'DIV':
                return 'Dividend';
            case 'ACATC':
                return 'Transfer';
            case 'DEP':
                return 'Deposit';
            case 'CSD':
                return 'Cash Debit';
            case 'CSW':
                return 'Cash Credit';
            default:
                return item.activity_type;
        }
    }
    
    // Handle orders (normalize to lowercase for comparison - handles both 'buy'/'sell' and 'BUY'/'SELL')
    if (item.side) {
        return item.side.toLowerCase() === 'buy' ? 'Buy' : 'Sell';
    }
    
    return 'Unknown';
};

const getCancellationInfo = (item: OrderData): { label: string; detail?: string } | null => {
    if (!item.status) return null;
    const status = item.status.toLowerCase();
    if (status !== 'cancelled' && status !== 'canceled') return null;
    if (!item.cancellation_reason && !item.last_error) return null;

    const reason = item.cancellation_reason || '';
    const normalized = reason.toLowerCase();
    let label = 'Cancelled';

    if (normalized === 'expired_24h') {
        label = 'Cancelled: order expired';
    } else if (normalized === 'price_deviation_exceeded') {
        label = 'Cancelled: price moved';
    } else if (normalized === 'user_cancelled') {
        label = 'Cancelled by you';
    } else if (normalized) {
        label = `Cancelled: ${normalized.replace(/_/g, ' ')}`;
    }

    const detail = item.last_error || undefined;
    return { label, detail };
};

// Get the transaction amount
const getTransactionAmount = (item: OrderData): number => {
    // For activities with net_amount
    if (item.activity_type && item.net_amount) {
        return parseFloat(item.net_amount);
    }
    
    // For order fills
    if (item.filled_qty && item.filled_avg_price) {
        return parseFloat(item.filled_qty) * parseFloat(item.filled_avg_price);
    }
    
    // For unfilled orders with qty and limit price
    if (item.qty && item.limit_price) {
        return parseFloat(item.qty) * parseFloat(item.limit_price);
    }
    
    // For unfilled orders with notional amount (string format from Alpaca)
    if (item.notional) {
        return parseFloat(item.notional);
    }
    
    // For queued orders with notional_value (number format from our queue)
    if (item.notional_value) {
        return item.notional_value;
    }
    
    return 0;
};

// Get transaction status text
const getStatusText = (item: OrderData): string => {
    // For activities
    if (item.activity_type) {
        switch (item.activity_type) {
            case 'FILL':
                return 'Filled';
            case 'DIV':
                return 'Processed';
            case 'ACATC':
                return 'Completed';
            case 'DEP':
                return 'Completed';
            default:
                return 'Processed';
        }
    }
    
    // For orders
    if (item.status) {
        return item.status === 'filled' ? 'Filled' : item.status.replace(/_/g, ' ');
    }
    
    return 'Unknown';
};

// Get ticker/name for the transaction
const getSymbol = (item: OrderData): string => {
    if (item.symbol) return item.symbol;
    if (item.activity_type) {
        if (item.description) return item.description;
        return 'CASH';
    }
    return '--';
};

const TransactionsTable: React.FC<TransactionsTableProps> = ({ initialOrders, accountId, fetchData, isLoading: parentLoading, onOrderCancelled }) => {
    const [orders, setOrders] = useState<OrderData[]>(initialOrders);
    const [isLoading, setIsLoading] = useState<boolean>(parentLoading || false);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [hasNextPage, setHasNextPage] = useState(initialOrders.length >= 50); // Assume true if we have 50+ initial orders
    const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    // Add a state to track orders that we've already checked and found to be unavailable
    const [unavailableOrderIds, setUnavailableOrderIds] = useState<Set<string>>(new Set());
    // Track the number of consecutive polling failures
    const [consecutiveFailures, setConsecutiveFailures] = useState(0);
    
    // Order cancellation state
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [orderToCancel, setOrderToCancel] = useState<OrderData | null>(null);
    const [isCancelling, setIsCancelling] = useState(false);
    
    // Using react-hot-toast for notifications (consistent with existing app pattern)

    // Helper function to determine if an order can be cancelled
    const isOrderCancellable = (order: OrderData): boolean => {
        // Only orders (not activities) can be cancelled
        if (order.activity_type) return false;
        
        // Queued orders (placed when market was closed) can always be cancelled
        if (order.is_queued) return true;
        
        // Only pending/open orders can be cancelled
        const cancellableStatuses = ['new', 'pending_new', 'accepted', 'pending_cancel', 'pending_replace', 'open', 'queued'];
        return order.status ? cancellableStatuses.includes(order.status.toLowerCase()) : false;
    };

    // Function to handle cancel order button click
    const handleCancelOrderClick = (order: OrderData) => {
        setOrderToCancel(order);
        setShowCancelModal(true);
    };

    // Function to handle modal close
    const handleCancelModalClose = () => {
        if (!isCancelling) {
            setShowCancelModal(false);
            setOrderToCancel(null);
        }
    };

    // Function to handle order cancellation confirmation
    const handleConfirmCancellation = async () => {
        if (!orderToCancel) return;

        setIsCancelling(true);

        try {
            let response: Response;
            
            // Use different endpoint for queued orders vs brokerage orders
            if (orderToCancel.is_queued) {
                // Queued orders use our internal database endpoint
                response = await fetch(`/api/snaptrade/queued-order/${orderToCancel.id}`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                });
            } else if (!accountId) {
                throw new Error('Account ID required to cancel brokerage order');
            } else {
                // Brokerage orders use the Alpaca/SnapTrade endpoint
                response = await fetch(`/api/portfolio/orders/cancel/${accountId}/${orderToCancel.id}`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                });
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to cancel order');
            }

            // Success - immediately remove from parent's orders list
            toast.success(`Order ${orderToCancel.symbol || orderToCancel.id.substring(0, 8)} has been successfully cancelled.`);

            // Notify parent component to remove the order immediately
            if (onOrderCancelled) {
                onOrderCancelled(orderToCancel.id);
            }

            // Close modal
            setShowCancelModal(false);
            setOrderToCancel(null);

        } catch (error: any) {
            console.error('Error cancelling order:', error);
            toast.error(error.message || 'Failed to cancel order. Please try again.');
        } finally {
            setIsCancelling(false);
        }
    };

    // Function to copy order ID to clipboard
    const copyToClipboard = (id: string) => {
        navigator.clipboard.writeText(id)
            .then(() => {
                setCopiedId(id);
                // Reset the copied state after 2 seconds
                setTimeout(() => setCopiedId(null), 2000);
            })
            .catch(err => {
                console.error('Failed to copy order ID:', err);
            });
    };

    // IMPORTANT: COMPLETELY DISABLE the order status refresh function
    // The API server doesn't support individual order endpoints, so this functionality is not needed
    const refreshOrderStatus = useCallback(async () => {
        // This function is intentionally disabled as the backend doesn't support
        // individual order status polling
        return;
    }, [accountId, orders]);

    // Modify the polling setup to not poll at all
    useEffect(() => {
        // We're not going to set up any polling as the API doesn't support individual order endpoints
        // Cleanup any existing intervals just in case
        if (pollingInterval) {
            clearInterval(pollingInterval);
            setPollingInterval(null);
        }
        
        return () => {
            if (pollingInterval) {
                clearInterval(pollingInterval);
            }
        };
    }, [accountId, orders, refreshOrderStatus, pollingInterval]);

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
            const beforeTimestamp = oldestOrder?.created_at || oldestOrder?.date;
            
            // Build the endpoint with pagination
            const endpoint = `/api/portfolio/orders?accountId=${accountId}&status=all&limit=50&direction=desc&nested=true${beforeTimestamp ? `&until=${beforeTimestamp}` : ''}`;
            
            const newOrders = await fetchData(endpoint);
            
            // If we got back fewer than 50 orders, assume we've reached the end
            setHasNextPage(newOrders.length >= 50);
            
            // Avoid duplicates by filtering out orders we already have
            const existingIds = new Set(orders.map(order => order.id));
            const uniqueNewOrders = newOrders.filter((order: OrderData) => !existingIds.has(order.id));
            
            // We've already confirmed the activities endpoint doesn't exist, so skip that check
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
                  <TableHead>Transaction Type</TableHead>
                  <TableHead>Submitted At</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead>Ticker</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Order ID</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                  <TableHead className="text-right w-12">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((item) => {
                  const amount = getTransactionAmount(item);
                  const transactionType = getTransactionType(item);
                  const status = getStatusText(item);
                  const symbol = getSymbol(item);
                  const cancellationInfo = getCancellationInfo(item);
                  
                  // Use a shortened version of the ID for display
                  const shortId = item.id ? item.id.substring(0, 12) : '--';
                  
                  // Determine appropriate colors based on transaction type (handle both 'buy'/'sell' and 'BUY'/'SELL')
                  let typeColor = '';
                  const sideLower = item.side?.toLowerCase();
                  if (sideLower === 'buy' || item.activity_type === 'DEP' || item.activity_type === 'DIV') {
                    typeColor = 'text-green-500';
                  } else if (sideLower === 'sell') {
                    typeColor = 'text-red-500';
                  }

                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <span className={typeColor}>
                          {transactionType}
                        </span>
                      </TableCell>
                      <TableCell>{formatDateTime(item.submitted_at || item.created_at || item.date)}</TableCell>
                      <TableCell>{formatDateTime(item.updated_at || item.filled_at)}</TableCell>
                      <TableCell className="font-medium">{symbol}</TableCell>
                      <TableCell>
                        {item.account_name ? (
                          <Badge variant="outline" className="text-xs font-normal">
                            {item.account_name}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">Clera</span>
                        )}
                      </TableCell>
                      <TableCell>{formatCurrency(amount.toString())}</TableCell>
                      <TableCell>
                        {item.id ? (
                          <div className="flex items-center space-x-1 group">
                            <span>{shortId}</span>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button 
                                    onClick={() => copyToClipboard(item.id)}
                                    className="opacity-0 group-hover:opacity-70 hover:opacity-100 transition-opacity"
                                    aria-label="Copy order ID"
                                  >
                                    <Copy size={14} className={copiedId === item.id ? "text-green-500" : "text-gray-400"} />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  {copiedId === item.id ? "Copied!" : "Copy order ID"}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        ) : (
                          <span>--</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant={getStatusVariant(item.status, item.activity_type)}>
                            {status}
                          </Badge>
                          {cancellationInfo && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-xs text-muted-foreground cursor-help">
                                    {cancellationInfo.label}
                                  </span>
                                </TooltipTrigger>
                                {cancellationInfo.detail && (
                                  <TooltipContent side="left">
                                    {cancellationInfo.detail}
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {isOrderCancellable(item) && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCancelOrderClick(item);
                                  }}
                                  className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                  disabled={isCancelling}
                                  aria-label="Cancel order"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="left">
                                Cancel order
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
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
            
            {/* Order cancellation modal */}
            <OrderCancelModal
                isOpen={showCancelModal}
                onClose={handleCancelModalClose}
                onConfirm={handleConfirmCancellation}
                isLoading={isCancelling}
                orderSymbol={orderToCancel?.symbol}
                orderId={orderToCancel?.id}
            />
        </>
    );
};

export default TransactionsTable; 