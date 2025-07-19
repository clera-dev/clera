"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  ArrowUpRight, 
  ArrowDownRight,
  DollarSign,
  Calendar,
  Hash
} from "lucide-react";

// Types
interface OrderHistoryItem {
  id: string;
  symbol: string;
  side: string;
  qty?: string;
  filled_qty?: string;
  filled_avg_price?: string;
  notional?: string;
  status: string;
  created_at: string;
  filled_at?: string;
  submitted_at?: string;
  order_type: string;
  time_in_force: string;
  limit_price?: string;
  stop_price?: string;
  commission?: string;
}

type TimeRange = '1y' | '6m' | '3m' | '1m';

// Utility functions
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return {
    date: date.toLocaleDateString(),
    time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
};

const formatCurrency = (amount: string | number | null | undefined) => {
  // Handle null, undefined, or empty string
  if (amount == null || amount === '') {
    return '$0.00';
  }
  
  // Convert to number, handling string inputs
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  // Check if the result is a valid number
  if (isNaN(num)) {
    return '$0.00';
  }
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(num);
};

const formatNumber = (num: string | number | null | undefined) => {
  // Handle null, undefined, or empty string
  if (num == null || num === '') {
    return '0';
  }
  
  // Convert to number, handling string inputs
  const value = typeof num === 'string' ? parseFloat(num) : num;
  
  // Check if the result is a valid number
  if (isNaN(value)) {
    return '0';
  }
  
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  }).format(value);
};

// Optimized formatter for quantities that should always show 2 decimal places
const formatQuantity = (num: string | number | null | undefined) => {
  // Handle null, undefined, or empty string
  if (num == null || num === '') {
    return '0.00';
  }
  
  // Convert to number, handling string inputs
  const value = typeof num === 'string' ? parseFloat(num) : num;
  
  // Check if the result is a valid number
  if (isNaN(value)) {
    return '0.00';
  }
  
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const getStatusColor = (status: string) => {
  status = status.toLowerCase();
  
  // Completed orders
  if (status === 'filled') return 'bg-green-500';
  
  // Active/Pending orders
  if (status === 'open' || status === 'new' || status === 'accepted_for_bidding' || 
      status === 'pending' || status === 'pending_new' || status === 'pending_cancel' || 
      status === 'pending_replace' || status === 'partially_filled' || status === 'accepted') {
    return 'bg-yellow-500';
  }
  
  // Cancelled/Rejected orders
  if (status === 'canceled' || status === 'cancelled' || status === 'rejected' || 
      status === 'expired' || status === 'failed' || status === 'stopped') {
    return 'bg-red-500';
  }
  
  return 'bg-gray-500';
};

const getDisplayStatus = (status: string) => {
  status = status.toLowerCase();
  
  // Completed orders
  if (status === 'filled') return 'Filled';
  
  // Active/Pending orders - show as "Pending" for user clarity
  if (status === 'open' || status === 'new' || status === 'accepted_for_bidding' || 
      status === 'pending' || status === 'pending_new' || status === 'pending_cancel' || 
      status === 'pending_replace' || status === 'partially_filled' || status === 'accepted') {
    return 'Pending';
  }
  
  // Cancelled/Rejected orders
  if (status === 'canceled' || status === 'cancelled') return 'Cancelled';
  if (status === 'rejected') return 'Rejected';
  if (status === 'expired') return 'Expired';
  if (status === 'failed') return 'Failed';
  if (status === 'stopped') return 'Stopped';
  
  return status.charAt(0).toUpperCase() + status.slice(1);
};

const getStatusIcon = (status: string) => {
  status = status.toLowerCase();
  
  // Completed orders
  if (status === 'filled') return <CheckCircle className="h-5 w-5 text-green-600" />;
  
  // Active/Pending orders
  if (status === 'open' || status === 'new' || status === 'accepted_for_bidding' || 
      status === 'pending' || status === 'pending_new' || status === 'pending_cancel' || 
      status === 'pending_replace' || status === 'partially_filled' || status === 'accepted') {
    return <Clock className="h-5 w-5 text-yellow-600" />;
  }
  
  // Cancelled/Rejected orders
  if (status === 'canceled' || status === 'cancelled' || status === 'rejected' || 
      status === 'expired' || status === 'failed' || status === 'stopped') {
    return <XCircle className="h-5 w-5 text-red-600" />;
  }
  
  return <AlertCircle className="h-5 w-5 text-gray-600" />;
};

const getSideIcon = (side: string) => {
  return side.toLowerCase() === 'buy' ? (
    <ArrowUpRight className="h-4 w-4 text-green-600" />
  ) : (
    <ArrowDownRight className="h-4 w-4 text-red-600" />
  );
};

const getSideColor = (side: string) => {
  return side.toLowerCase() === 'buy' ? 'text-green-600' : 'text-red-600';
};

// Helper function to determine if an order should show price information
const shouldShowPriceInfo = (status: string) => {
  status = status.toLowerCase();
  
  // Only show price info for filled orders
  return status === 'filled';
};

// Date utility
const subtractMonths = (date: Date, months: number): Date => {
  const newDate = new Date(date);
  const currentDay = newDate.getDate();
  
  // Set to first day of the month to avoid rollover issues
  newDate.setDate(1);
  
  // Subtract the months
  newDate.setMonth(newDate.getMonth() - months);
  
  // Get the last day of the target month
  const lastDayOfMonth = new Date(newDate.getFullYear(), newDate.getMonth() + 1, 0).getDate();
  
  // Set the day, but don't exceed the last day of the month
  newDate.setDate(Math.min(currentDay, lastDayOfMonth));
  
  return newDate;
};

const getAfterDate = (timeRange: TimeRange): string => {
  const now = new Date();
  
  switch (timeRange) {
    case '1m':
      return subtractMonths(now, 1).toISOString();
    case '3m':
      return subtractMonths(now, 3).toISOString();
    case '6m':
      return subtractMonths(now, 6).toISOString();
    case '1y':
    default:
      return subtractMonths(now, 12).toISOString();
  }
};

// Custom hook for order history data
const useOrderHistory = (timeRange: TimeRange) => {
  const [orders, setOrders] = useState<OrderHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrderHistory = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const accountId = localStorage.getItem('alpacaAccountId');
      if (!accountId) {
        throw new Error('No account ID found');
      }

      const afterDate = getAfterDate(timeRange);

      // Fetch both closed and open orders separately since Alpaca doesn't support status=all
      const [closedResponse, openResponse] = await Promise.all([
        fetch(`/api/portfolio/orders?accountId=${encodeURIComponent(accountId)}&status=closed&limit=50&direction=desc&after=${afterDate}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }),
        fetch(`/api/portfolio/orders?accountId=${encodeURIComponent(accountId)}&status=open&limit=50&direction=desc&after=${afterDate}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        })
      ]);

      if (!closedResponse.ok) {
        throw new Error(`Failed to fetch closed orders: ${closedResponse.statusText}`);
      }

      if (!openResponse.ok) {
        throw new Error(`Failed to fetch open orders: ${openResponse.statusText}`);
      }

      const [closedData, openData] = await Promise.all([
        closedResponse.json(),
        openResponse.json()
      ]);

      // Combine and deduplicate orders
      const allOrders = [...(Array.isArray(closedData) ? closedData : []), ...(Array.isArray(openData) ? openData : [])];
      const uniqueOrders = allOrders.filter((order, index, self) => 
        index === self.findIndex(o => o.id === order.id)
      );

      if (Array.isArray(uniqueOrders)) {
        // Sort orders by creation date (newest first)
        const sortedOrders = uniqueOrders.sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        
        setOrders(sortedOrders);
      } else {
        console.error('Order History: Invalid response format', uniqueOrders);
        setError('Invalid response format from server');
      }
    } catch (error) {
      console.error('Error fetching order history:', error);
      setError(error instanceof Error ? error.message : 'Failed to load order history');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderHistory();
  }, [timeRange]);

  return { orders, isLoading, error, refetch: fetchOrderHistory };
};

// Custom hook for positions check
const usePositionsCheck = () => {
  const [hasPositions, setHasPositions] = useState(false);

  const checkPositions = async () => {
    try {
      const accountId = localStorage.getItem('alpacaAccountId');
      if (!accountId) return;

      const response = await fetch(`/api/portfolio/positions?accountId=${encodeURIComponent(accountId)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const positions = await response.json();
        setHasPositions(Array.isArray(positions) && positions.length > 0);
      }
    } catch (error) {
      console.error('Error checking positions:', error);
    }
  };

  useEffect(() => {
    checkPositions();
  }, []);

  return { hasPositions };
};

// Time Range Selector Component
interface TimeRangeSelectorProps {
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
}

const TimeRangeSelector = ({ timeRange, onTimeRangeChange }: TimeRangeSelectorProps) => (
  <div className="flex items-center gap-2">
    <span className="text-sm text-muted-foreground">Time Range:</span>
    <select
      value={timeRange}
      onChange={(e) => onTimeRangeChange(e.target.value as TimeRange)}
      className="text-sm border border-border rounded px-2 py-1 bg-background text-foreground"
    >
      <option value="1m">1 Month</option>
      <option value="3m">3 Months</option>
      <option value="6m">6 Months</option>
      <option value="1y">1 Year</option>
    </select>
  </div>
);

// Loading State Component
const OrderHistoryLoading = () => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5" />
        Order History
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div className="flex justify-center py-8">
        <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    </CardContent>
  </Card>
);

// Error State Component
interface OrderHistoryErrorProps {
  error: string;
  onRetry: () => void;
}

const OrderHistoryError = ({ error, onRetry }: OrderHistoryErrorProps) => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5" />
        Order History
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-center py-8">
        <p className="text-red-600 dark:text-red-400 mb-2">{error}</p>
        <button 
          onClick={onRetry}
          className="text-blue-600 hover:text-blue-800 underline"
        >
          Try again
        </button>
      </div>
    </CardContent>
  </Card>
);

// Empty State Component
interface OrderHistoryEmptyProps {
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  hasPositions: boolean;
  onRetry: () => void;
}

const OrderHistoryEmpty = ({ timeRange, onTimeRangeChange, hasPositions, onRetry }: OrderHistoryEmptyProps) => (
  <Card>
    <CardHeader>
      <div className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Order History
        </CardTitle>
        <TimeRangeSelector timeRange={timeRange} onTimeRangeChange={onTimeRangeChange} />
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-center py-8">
        <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
        <p className="text-muted-foreground">No orders found for the selected time range</p>
        <p className="text-sm text-muted-foreground mt-1">
          {hasPositions 
            ? "You have positions but no recent orders. This may be due to Alpaca's API limitations on historical order data."
            : "Try adjusting the time range or check if you have any trading activity"
          }
        </p>
        {hasPositions && (
          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              💡 <strong>Note:</strong> Your account has active positions, which indicates trading activity. 
              Alpaca's API may have limitations on historical order data retrieval.
            </p>
          </div>
        )}
        <div className="mt-4">
          <button 
            onClick={onRetry}
            className="text-blue-600 hover:text-blue-800 underline text-sm"
          >
            Refresh orders
          </button>
        </div>
      </div>
    </CardContent>
  </Card>
);

// Order Item Component
interface OrderItemProps {
  order: OrderHistoryItem;
  onClick: (order: OrderHistoryItem) => void;
}

const OrderItem = ({ order, onClick }: OrderItemProps) => {
  const created = formatDate(order.created_at);
  const filled = order.filled_at ? formatDate(order.filled_at) : null;
  
  return (
    <div
      className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors cursor-pointer min-h-[80px] sm:min-h-[60px]"
      onClick={() => onClick(order)}
    >
      <div className="flex items-start sm:items-center space-x-4 flex-1 min-w-0">
        <div className="flex-shrink-0 mt-1 sm:mt-0">
          {getStatusIcon(order.status)}
        </div>
        <div className="flex-grow min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="flex items-center gap-1">
              {getSideIcon(order.side)}
              <p className="font-semibold text-foreground">
                {order.symbol}
              </p>
            </div>
            <Badge className={`text-xs ${getStatusColor(order.status)}`}>
              {getDisplayStatus(order.status)}
            </Badge>
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-sm font-medium ${getSideColor(order.side)}`}>
                {order.side.toUpperCase()}
              </span>
              {(order.filled_qty || order.qty) && (
                <span className="text-sm text-muted-foreground">
                  {formatQuantity(order.filled_qty || order.qty || '0')} shares
                </span>
              )}
              {shouldShowPriceInfo(order.status) && (
                <span className="text-sm text-muted-foreground">
                  at {formatCurrency(order.filled_avg_price)} per share
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Created: {created.date} at {created.time}
            </p>
            {filled && (
              <p className="text-sm text-muted-foreground">
                Filled: {filled.date} at {filled.time}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Order Details Modal Component
interface OrderDetailsModalProps {
  order: OrderHistoryItem | null;
  isOpen: boolean;
  onClose: () => void;
}

const OrderDetailsModal = ({ order, isOpen, onClose }: OrderDetailsModalProps) => {
  if (!order) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-card text-foreground border-border shadow-xl z-50">
        <DialogHeader className="pb-2 border-border">
          <DialogTitle className="text-xl text-foreground flex items-center gap-2">
            {getSideIcon(order.side)}
            Order Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Order Summary */}
          <div className="bg-muted/30 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-lg">{order.symbol}</h3>
              <Badge className={`text-xs ${getStatusColor(order.status)}`}>
                {getDisplayStatus(order.status)}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <span className={`font-medium ${getSideColor(order.side)}`}>
                {order.side.toUpperCase()}
              </span>
              {(order.filled_qty || order.qty) && (
                <span className="text-sm text-muted-foreground">
                  {formatQuantity(order.filled_qty || order.qty || '0')} shares
                </span>
              )}
            </div>
            {shouldShowPriceInfo(order.status) && (
              <div className="text-sm text-muted-foreground">
                Avg Price: {formatCurrency(order.filled_avg_price)}
              </div>
            )}
          </div>

          {/* Order Details */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="flex items-center gap-1 text-muted-foreground mb-1">
                  <Hash className="h-3 w-3" />
                  Order ID
                </div>
                <div className="font-mono text-xs">{order.id}</div>
              </div>
              
              <div>
                <div className="flex items-center gap-1 text-muted-foreground mb-1">
                  <DollarSign className="h-3 w-3" />
                  Order Type
                </div>
                <div className="font-medium">{order.order_type.charAt(0).toUpperCase() + order.order_type.slice(1)}</div>
              </div>
            </div>

            {/* Timestamps */}
            <div className="space-y-2">
              <div className="flex items-center gap-1 text-muted-foreground text-sm">
                <Calendar className="h-3 w-3" />
                Timestamps
              </div>
              
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created:</span>
                  <span>{formatDate(order.created_at).date} at {formatDate(order.created_at).time}</span>
                </div>
                
                {order.submitted_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Submitted:</span>
                    <span>{formatDate(order.submitted_at).date} at {formatDate(order.submitted_at).time}</span>
                  </div>
                )}
                
                {order.filled_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Filled:</span>
                    <span>{formatDate(order.filled_at).date} at {formatDate(order.filled_at).time}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Order Details */}
            <div className="space-y-2">
              <div className="flex items-center gap-1 text-muted-foreground text-sm">
                <TrendingUp className="h-3 w-3" />
                Order Details
              </div>
              
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Quantity:</span>
                  <span>{formatQuantity(order.filled_qty || order.qty)} shares</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Notional:</span>
                  <span>{formatCurrency(order.notional)}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Limit Price:</span>
                  <span>{formatCurrency(order.limit_price)}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Stop Price:</span>
                  <span>{formatCurrency(order.stop_price)}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Time in Force:</span>
                  <span>{order.time_in_force.charAt(0).toUpperCase() + order.time_in_force.slice(1)}</span>
                </div>
                
                {order.commission && parseFloat(order.commission) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Commission:</span>
                    <span>{formatCurrency(order.commission)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={onClose} variant="outline">
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Main OrderHistory Component
export default function OrderHistory() {
  const [timeRange, setTimeRange] = useState<TimeRange>('1y');
  const [selectedOrder, setSelectedOrder] = useState<OrderHistoryItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { orders, isLoading, error, refetch } = useOrderHistory(timeRange);
  const { hasPositions } = usePositionsCheck();

  const handleOrderClick = (order: OrderHistoryItem) => {
    setSelectedOrder(order);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedOrder(null);
  };

  // Render loading state
  if (isLoading) {
    return <OrderHistoryLoading />;
  }

  // Render error state
  if (error) {
    return <OrderHistoryError error={error} onRetry={refetch} />;
  }

  // Render empty state
  if (orders.length === 0) {
    return (
      <OrderHistoryEmpty
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        hasPositions={hasPositions}
        onRetry={refetch}
      />
    );
  }

  // Render main content
  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Order History
            </CardTitle>
            <TimeRangeSelector timeRange={timeRange} onTimeRangeChange={setTimeRange} />
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-3">
              {orders.map((order, index) => (
                <OrderItem
                  key={order.id || index}
                  order={order}
                  onClick={handleOrderClick}
                />
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <OrderDetailsModal
        order={selectedOrder}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />
    </>
  );
} 