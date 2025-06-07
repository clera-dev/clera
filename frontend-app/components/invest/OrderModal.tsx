'use client'

import { useState, useEffect, useCallback } from 'react';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription, 
    DialogFooter 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, Terminal, TrendingUp, TrendingDown } from "lucide-react";
import toast from 'react-hot-toast';
import { formatCurrency } from "@/lib/utils";

interface OrderModalProps {
  isOpen: boolean;
  onClose: (shouldRefresh?: boolean) => void;
  symbol: string;
  accountId: string | null;
  orderType: 'BUY' | 'SELL';
  currentQuantity?: string; // For sell orders, to show max sellable
  currentMarketValue?: string; // For sell orders, to show current value
}

// Minimal number pad component
const NumberPad = ({ onInput }: { onInput: (value: string) => void }) => {
  const buttons = [
    '1', '2', '3', 
    '4', '5', '6', 
    '7', '8', '9', 
    '.', '0', '⌫' // Backspace
  ];
  return (
    <div className="grid grid-cols-3 gap-2 mt-4">
      {buttons.map((btn) => (
        <Button
          key={btn}
          variant="outline"
          size="lg"
          className="text-xl font-semibold h-14"
          onClick={() => onInput(btn)}
        >
          {btn}
        </Button>
      ))}
    </div>
  );
};

export default function OrderModal({ 
  isOpen, 
  onClose, 
  symbol, 
  accountId, 
  orderType, 
  currentQuantity,
  currentMarketValue 
}: OrderModalProps) {
  const [amount, setAmount] = useState('');
  const [marketPrice, setMarketPrice] = useState<number | null>(null);
  const [isLoadingPrice, setIsLoadingPrice] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isBuyOrder = orderType === 'BUY';
  const isSellOrder = orderType === 'SELL';

  const fetchMarketPrice = useCallback(async () => {
    if (!symbol) return;
    setIsLoadingPrice(true);
    setPriceError(null);
    try {
      // Fetch from the new backend endpoint
      const response = await fetch(`/api/market/latest-trade/${symbol}`);
      const result = await response.json();

      if (!response.ok || !result.success) {
          throw new Error(result.detail || result.message || 'Failed to fetch market price.');
      }

      if (result.price) {
        setMarketPrice(result.price);
      } else {
        setPriceError('Could not fetch latest market price.');
      }
    } catch (error: any) {    
      console.error("Error fetching market price:", error);
      setPriceError(error.message || 'Failed to fetch market price.');
    } finally {
      setIsLoadingPrice(false);
    }
  }, [symbol]);

  // Fetch price when modal opens or symbol changes
  useEffect(() => {
    if (isOpen) {
      fetchMarketPrice();
      setAmount(''); // Reset amount on open
      setSubmitError(null);
    }
  }, [isOpen, fetchMarketPrice]);

  const handleNumberPadInput = (value: string) => {
    if (value === '⌫') {
      setAmount((prev) => prev.slice(0, -1));
    } else if (value === '.') {
      // Allow only one decimal point
      if (!amount.includes('.')) {
        setAmount((prev) => prev + value);
      }
    } else {
      setAmount((prev) => prev + value);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow only numbers and a single decimal point
    if (/^\d*\.?\d*$/.test(value)) {
      setAmount(value);
    }
  };

  const validateSellOrder = (): string | null => {
    if (!isSellOrder) return null;
    
    const notionalAmount = parseFloat(amount);
    const maxSellValue = currentMarketValue ? parseFloat(currentMarketValue) : null;
    
    if (maxSellValue && notionalAmount > maxSellValue) {
      return `Cannot sell more than your current holdings value of ${formatCurrency(maxSellValue)}.`;
    }
    
    return null;
  };

  const handlePlaceOrder = async () => {
    if (!accountId) {
      setSubmitError("Account ID not found. Please ensure you are logged in.");
      return;
    }
    
    const notionalAmount = parseFloat(amount);
    if (isNaN(notionalAmount) || notionalAmount <= 0) {
      setSubmitError("Please enter a valid amount greater than $0.");
      return;
    }

    // Validate sell order constraints
    const sellValidationError = validateSellOrder();
    if (sellValidationError) {
      setSubmitError(sellValidationError);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    const orderAction = isBuyOrder ? 'BUY' : 'SELL';
    // More specific loading message for different order types
    const loadingMessage = isSellOrder 
      ? `Selling $${notionalAmount.toFixed(2)} worth of ${symbol} from your portfolio...`
      : `Submitting ${orderAction} order for $${notionalAmount.toFixed(2)} of ${symbol}...`;
    const toastId = toast.loading(loadingMessage);

    try {
        const response = await fetch('/api/trade', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                account_id: accountId,
                ticker: symbol,
                notional_amount: notionalAmount,
                side: orderAction
            }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Failed to place order.');
        }

        // More specific success message for sell orders from portfolio
        const successMessage = result.message || (
          isSellOrder 
            ? `Successfully sold $${notionalAmount.toFixed(2)} worth of ${symbol} from your portfolio.`
            : `Successfully placed ${orderAction} order for ${symbol}.`
        );
        toast.success(successMessage, { id: toastId });
        setAmount(''); // Clear amount on success
        
        // For sell orders, trigger portfolio refresh to show updated holdings
        onClose(isSellOrder); // Close modal and refresh if it's a sell order

    } catch (error: any) {
        console.error("Error placing order:", error);
        const errorMessage = error.message || 'An unexpected error occurred.';
        setSubmitError(errorMessage);
        toast.error(`Order failed: ${errorMessage}`, { id: toastId });
    } finally {
        setIsSubmitting(false);
    }
  };

  // Format market price, handle loading/error
  const displayMarketPrice = isLoadingPrice
    ? "Loading..."
    : priceError
    ? "Error"
    : marketPrice
    ? formatCurrency(marketPrice)
    : "N/A";

  // Dynamic styling based on order type
  const orderTypeColor = isBuyOrder ? 'text-green-600' : 'text-red-600';
  const buttonColorClasses = isBuyOrder 
    ? 'bg-gradient-to-r from-teal-500 to-green-500 hover:from-teal-600 hover:to-green-600'
    : 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold flex items-center gap-2">
            {isBuyOrder ? (
              <TrendingUp className="h-5 w-5 text-green-600" />
            ) : (
              <TrendingDown className="h-5 w-5 text-red-600" />
            )}
            {isBuyOrder ? 'Buy' : 'Sell'} {symbol} Confirmation
          </DialogTitle>
          <DialogDescription>
            Enter the dollar amount you wish to {isBuyOrder ? 'invest' : 'sell'}.
          </DialogDescription>
        </DialogHeader>
        
        <div className="mt-4 space-y-3">
           <div className="flex justify-between items-center bg-muted p-3 rounded-md">
               <span className="text-sm font-medium text-muted-foreground">Order Type:</span>
               <Badge variant="outline" className={orderTypeColor}>
                 {isBuyOrder ? 'BUY (Market)' : 'SELL (Market)'}
               </Badge>
           </div>
           
            <div className="flex justify-between items-center bg-muted p-3 rounded-md">
               <span className="text-sm font-medium text-muted-foreground">Market Price:</span>
               <span className={`font-semibold ${priceError ? 'text-destructive' : ''}`}>{displayMarketPrice}</span>
            </div>

            {/* Show current holdings for sell orders */}
            {isSellOrder && currentQuantity && currentMarketValue && (
              <div className="flex justify-between items-center bg-muted p-3 rounded-md">
                <span className="text-sm font-medium text-muted-foreground">Your Holdings:</span>
                <div className="text-right">
                  <div className="font-semibold">{formatCurrency(parseFloat(currentMarketValue))}</div>
                  <div className="text-xs text-muted-foreground">
                    {parseFloat(currentQuantity).toLocaleString()} shares
                  </div>
                </div>
              </div>
            )}
        </div>

        {priceError && (
             <Alert variant="destructive" className="mt-2">
                <Terminal className="h-4 w-4" />
                <AlertTitle>Price Fetch Error</AlertTitle>
                <AlertDescription>{priceError}</AlertDescription>
            </Alert>
        )}

        <div className="mt-4">
            <label htmlFor="amount" className="block text-sm font-medium text-muted-foreground mb-1">
              Amount ($)
            </label>
            <Input
                id="amount"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={handleInputChange}
                className="text-center text-2xl font-bold h-14 focus-visible:ring-primary"
                disabled={isSubmitting}
            />
        </div>

        <NumberPad onInput={handleNumberPadInput} />

        {submitError && (
             <Alert variant="destructive" className="mt-4">
                <Terminal className="h-4 w-4" />
                <AlertTitle>Order Submission Error</AlertTitle>
                <AlertDescription>{submitError}</AlertDescription>
            </Alert>
        )}

        <DialogFooter className="mt-6">
          <Button 
            type="button"
            size="lg"
            className={`w-full ${buttonColorClasses} text-white font-bold text-lg`}
            onClick={handlePlaceOrder}
            disabled={isSubmitting || isLoadingPrice || !amount || parseFloat(amount) <= 0}
          >
            {isSubmitting ? (
              <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Placing Order...</>
            ) : (
              `Place ${isBuyOrder ? 'Buy' : 'Sell'} Order`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 