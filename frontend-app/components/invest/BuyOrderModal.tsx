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
import { Loader2, Terminal } from "lucide-react";
import toast from 'react-hot-toast';
import { formatCurrency } from "@/lib/utils"; // Assuming formatCurrency is in lib/utils

interface BuyOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  accountId: string | null;
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


export default function BuyOrderModal({ isOpen, onClose, symbol, accountId }: BuyOrderModalProps) {
  const [amount, setAmount] = useState('');
  const [marketPrice, setMarketPrice] = useState<number | null>(null);
  const [isLoadingPrice, setIsLoadingPrice] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

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

    setIsSubmitting(true);
    setSubmitError(null);
    const toastId = toast.loading(`Submitting BUY order for $${notionalAmount.toFixed(2)} of ${symbol}...`);

    try {
        const response = await fetch('/api/trade', { // Call backend endpoint
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Add Auth headers if your backend /api/trade requires them
            },
            body: JSON.stringify({
                account_id: accountId,
                ticker: symbol,
                notional_amount: notionalAmount,
                side: 'BUY'
            }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Failed to place order.');
        }

        toast.success(result.message || `Successfully placed BUY order for ${symbol}.`, { id: toastId });
        setAmount(''); // Clear amount on success
        onClose(); // Close modal on success

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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[100vw] h-[100vh] sm:w-[95vw] sm:max-w-md sm:h-auto sm:max-h-[85vh] mx-auto overflow-hidden z-[110] fixed top-[0] left-[0] sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] translate-x-0 translate-y-0 rounded-none sm:rounded-lg flex flex-col">
        <DialogHeader className="flex-shrink-0 px-4 pt-4 pb-2 sm:px-6 sm:pt-6">
          <DialogTitle className="text-xl font-semibold">Buy {symbol} Confirmation</DialogTitle>
          <DialogDescription>
            Enter the dollar amount you wish to invest.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 min-h-0">
          <div className="space-y-3">
            <div className="flex justify-between items-center bg-muted p-3 rounded-md">
              <span className="text-sm font-medium text-muted-foreground">Order Type:</span>
              <span className="font-semibold">BUY (Market)</span>
            </div>
            <div className="flex justify-between items-center bg-muted p-3 rounded-md">
              <span className="text-sm font-medium text-muted-foreground">Market Price:</span>
              <span className={`font-semibold ${priceError ? 'text-destructive' : ''}`}>{displayMarketPrice}</span>
            </div>

            {priceError && (
              <Alert variant="destructive" className="mt-2">
                <Terminal className="h-4 w-4" />
                <AlertTitle>Price Fetch Error</AlertTitle>
                <AlertDescription>{priceError}</AlertDescription>
              </Alert>
            )}

            <div className="mt-4">
              <label htmlFor="amount" className="block text-sm font-medium text-muted-foreground mb-1">Amount ($)</label>
              <Input
                id="amount"
                type="text" // Use text to allow decimal input management
                inputMode="decimal" // Hint for mobile keyboards
                placeholder="0.00"
                value={amount}
                onChange={handleInputChange}
                className="text-center text-2xl font-bold h-14 focus-visible:ring-primary"
                disabled={isSubmitting}
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
                data-form-type="other"
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
          </div>
        </div>

        <div className="flex-shrink-0 bg-background p-4 border-t sm:px-6">
          <Button 
            type="button"
            size="lg"
            className="w-full bg-gradient-to-r from-teal-500 to-green-500 hover:from-teal-600 hover:to-green-600 text-white font-bold text-base sm:text-lg h-12 sm:h-14"
            onClick={handlePlaceOrder}
            disabled={isSubmitting || isLoadingPrice || !amount || parseFloat(amount) <= 0}
          >
            {isSubmitting ? (
              <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Placing Order...</>
            ) : (
              "Place Buy Order"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
} 