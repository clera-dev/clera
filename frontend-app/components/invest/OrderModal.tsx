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
import { Loader2, Terminal, TrendingUp, TrendingDown, XCircle, Building2, Wallet, Clock, DollarSign, Hash } from "lucide-react";
import toast from 'react-hot-toast';
import { formatCurrency } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getMarketStatus } from "@/utils/market-hours";

// Webull requires a minimum of $5 for fractional share orders
const MINIMUM_ORDER_AMOUNT = 5;

interface OrderModalProps {
  isOpen: boolean;
  onClose: (shouldRefresh?: boolean) => void;
  symbol: string;
  accountId: string | null;
  orderType: 'BUY' | 'SELL';
  currentQuantity?: string; // For sell orders, to show max sellable
  currentMarketValue?: string; // For sell orders, to show current value
  onTradeSuccess?: () => void; // Callback for successful trades
}

interface TradeAccount {
  id: string;
  account_id: string;
  institution_name: string;
  account_name: string;
  cash: number;
  buying_power: number;
  type: 'snaptrade' | 'alpaca';
  is_trade_enabled: boolean;
}

export default function OrderModal({ 
  isOpen, 
  onClose, 
  symbol, 
  accountId, 
  orderType, 
  currentQuantity,
  currentMarketValue,
  onTradeSuccess
}: OrderModalProps) {
  const [amount, setAmount] = useState('');
  const [marketPrice, setMarketPrice] = useState<number | null>(null);
  const [isLoadingPrice, setIsLoadingPrice] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  
  // Input mode: dollars (default for buy), shares (available for sell)
  const [inputMode, setInputMode] = useState<'dollars' | 'shares'>('dollars');
  
  // Brokerage account selection
  const [tradeAccounts, setTradeAccounts] = useState<TradeAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);

  const isBuyOrder = orderType === 'BUY';
  const isSellOrder = orderType === 'SELL';
  
  // Calculate available shares for sell orders
  const availableShares = currentQuantity ? parseFloat(currentQuantity) : 0;
  const maxWholeShares = Math.floor(availableShares);

  // Check market status
  const marketStatus = getMarketStatus();

  // Fetch trade-enabled accounts
  const fetchTradeAccounts = useCallback(async () => {
    setIsLoadingAccounts(true);
    try {
      const response = await fetch('/api/snaptrade/trade-enabled-accounts');
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error('Failed to fetch trade accounts');
      }

      const allAccounts = [];
      
      // Add Alpaca account if it exists (future hybrid mode)
      if (result.alpaca_account) {
        allAccounts.push(result.alpaca_account);
      }
      
      // Add SnapTrade accounts
      if (result.accounts && result.accounts.length > 0) {
        allAccounts.push(...result.accounts);
      }

      setTradeAccounts(allAccounts);
      
      // Auto-select first account if available
      if (allAccounts.length > 0) {
        setSelectedAccount(allAccounts[0].account_id);
      }
    } catch (error) {
      console.error('Error fetching trade accounts:', error);
      toast.error('Failed to load brokerage accounts');
    } finally {
      setIsLoadingAccounts(false);
    }
  }, []);

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

  // Fetch price and accounts when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchMarketPrice();
      fetchTradeAccounts();
      setAmount(''); // Reset amount on open
      setSubmitError(null);
      // Default to shares mode for sell orders (whole shares required by brokerages)
      setInputMode(isSellOrder ? 'shares' : 'dollars');
    }
  }, [isOpen, fetchMarketPrice, fetchTradeAccounts, isSellOrder]);

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
    
    if (inputMode === 'shares') {
      const shareAmount = parseFloat(amount);
      if (shareAmount > maxWholeShares) {
        return `Cannot sell more than ${maxWholeShares} whole shares. You have ${availableShares.toFixed(3)} shares total.`;
      }
      if (shareAmount <= 0) {
        return 'Please enter at least 1 share to sell.';
      }
    } else {
      const notionalAmount = parseFloat(amount);
      const maxSellValue = currentMarketValue ? parseFloat(currentMarketValue) : null;
      
      if (maxSellValue && notionalAmount > maxSellValue) {
        return `Cannot sell more than your current holdings value of ${formatCurrency(maxSellValue)}.`;
      }
    }
    
    return null;
  };

  // Check if amount meets minimum order requirement
  const parsedAmount = parseFloat(amount) || 0;
  // For shares mode, minimum is 1 share; for dollars mode, minimum is $5
  const isBelowMinimum = inputMode === 'shares' 
    ? (parsedAmount > 0 && parsedAmount < 1)
    : (parsedAmount > 0 && parsedAmount < MINIMUM_ORDER_AMOUNT);
  const meetsMinimum = inputMode === 'shares'
    ? (parsedAmount >= 1 && Number.isInteger(parsedAmount))
    : (parsedAmount >= MINIMUM_ORDER_AMOUNT);

  const handlePlaceOrder = async () => {
    // Validate brokerage account selection
    if (!selectedAccount) {
      setSubmitError("Please select a brokerage account.");
      return;
    }
    
    const parsedValue = parseFloat(amount);
    if (isNaN(parsedValue) || parsedValue <= 0) {
      setSubmitError(inputMode === 'shares' 
        ? "Please enter a valid number of shares." 
        : "Please enter a valid amount greater than $0.");
      return;
    }
    
    // For shares mode, ensure whole number
    if (inputMode === 'shares' && !Number.isInteger(parsedValue)) {
      setSubmitError("Please enter a whole number of shares to sell.");
      return;
    }

    // Check if user has sufficient buying power for buy orders
    const selectedAccountData = tradeAccounts.find(acc => acc.account_id === selectedAccount);
    if (isBuyOrder && selectedAccountData) {
      if (parsedValue > selectedAccountData.buying_power) {
        setSubmitError(`Insufficient buying power. Available: ${formatCurrency(selectedAccountData.buying_power)}`);
        return;
      }
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
    const accountName = selectedAccountData?.institution_name || 'your account';
    
    // More specific loading message for different order types
    const loadingMessage = inputMode === 'shares'
      ? `Selling ${parsedValue} shares of ${symbol} from ${accountName}...`
      : isSellOrder 
        ? `Selling $${parsedValue.toFixed(2)} worth of ${symbol} from ${accountName}...`
        : `Submitting ${orderAction} order for $${parsedValue.toFixed(2)} of ${symbol} via ${accountName}...`;
    const toastId = toast.loading(loadingMessage);

    try {
        // Build request body - use units for shares mode, notional_amount for dollars mode
        const requestBody: {
          account_id: string;
          ticker: string;
          side: string;
          notional_amount?: number;
          units?: number;
        } = {
          account_id: selectedAccount,
          ticker: symbol,
          side: orderAction,
        };
        
        if (inputMode === 'shares') {
          requestBody.units = parsedValue;
        } else {
          requestBody.notional_amount = parsedValue;
        }
        
        const response = await fetch('/api/trade', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            // Check for wash trade error in multiple possible locations
            const errorMessage = result.message || result.error || '';
            
            if (errorMessage.includes('potential wash trade detected') || 
                errorMessage.includes('wash trade') ||
                (result.details && JSON.stringify(result.details).includes('potential wash trade detected'))) {
                throw new Error('WASH_TRADE');
            }
            throw new Error(errorMessage || 'Failed to place order.');
        }

        // More specific success message for sell orders from portfolio
        const successMessage = result.message || (
          inputMode === 'shares'
            ? `Successfully sold ${parsedValue} shares of ${symbol} from your portfolio.`
            : isSellOrder 
              ? `Successfully sold $${parsedValue.toFixed(2)} worth of ${symbol} from your portfolio.`
              : `Successfully placed ${orderAction} order for ${symbol}.`
        );
        toast.success(successMessage, { id: toastId });
        setAmount(''); // Clear amount on success
        
        // Call success callback if provided (for /invest page)
        if (onTradeSuccess) {
            onTradeSuccess();
        } else {
            // For sell orders, trigger portfolio refresh to show updated holdings
            onClose(isSellOrder); // Close modal and refresh if it's a sell order
        }

    } catch (error: any) {
        console.error("Error placing order:", error);
        
        // Handle wash trade error specially
        if (error.message === 'WASH_TRADE') {
            toast.dismiss(toastId); // Dismiss loading toast properly
            onClose(false); // Close order modal immediately
            // Show specific wash trade error message
            setTimeout(() => {
                toast.error('Order cannot be placed. You have a pending opposite trade for this stock that needs to settle first.', {
                    duration: 6000, // Show for 6 seconds
                });
            }, 100);
            return;
        }
        
        // Also check if the error message itself contains wash trade info
        const errorString = String(error.message || error || '');
        if (errorString.includes('potential wash trade detected') || errorString.includes('wash trade')) {
            toast.dismiss(toastId); // Dismiss loading toast properly
            onClose(false); // Close order modal immediately
            setTimeout(() => {
                toast.error('Order cannot be placed. You have a pending opposite trade for this stock that needs to settle first.', {
                    duration: 6000, // Show for 6 seconds
                });
            }, 100);
            return;
        }
        
        // Fallback: For ANY other error, close the modal and show generic error
        const errorMessage = error.message || 'An unexpected error occurred.';
        toast.dismiss(toastId); // Dismiss loading toast properly
        onClose(false); // Close order modal for any error
        
        // Show generic error toast after modal closes
        setTimeout(() => {
            toast.error(`Order failed: ${errorMessage}`);
        }, 100);
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

  // Get selected account data for display
  const selectedAccountData = tradeAccounts.find(acc => acc.account_id === selectedAccount);

  // Dynamic styling based on order type
  const orderTypeColor = isBuyOrder ? 'text-green-600' : 'text-red-600';
  const buttonColorClasses = isBuyOrder 
    ? 'bg-gradient-to-r from-teal-500 to-green-500 hover:from-teal-600 hover:to-green-600'
    : 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700';

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="w-[100vw] h-[100vh] sm:w-[95vw] sm:max-w-md sm:h-auto sm:max-h-[85vh] mx-auto overflow-hidden z-[110] fixed top-[0] left-[0] sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] translate-x-0 translate-y-0 rounded-none sm:rounded-lg flex flex-col">
        <DialogHeader className="flex-shrink-0 px-4 pt-2 pb-1 sm:px-6 sm:pt-6">
          <DialogTitle className="text-lg sm:text-xl font-semibold flex items-center gap-2">
            {isBuyOrder ? (
              <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 sm:h-5 sm:w-5 text-red-600" />
            )}
            {isBuyOrder ? 'Buy' : 'Sell'} {symbol} Confirmation
          </DialogTitle>
          <DialogDescription className="text-sm">
            Enter the dollar amount you wish to {isBuyOrder ? 'invest' : 'sell'}.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 min-h-0">
          <div className="space-y-3">
            {/* Market Closed Banner */}
            {!marketStatus.isOpen && (
              <Alert className="border-amber-500/50 bg-amber-500/10">
                <Clock className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-sm text-amber-700 dark:text-amber-400">
                  {marketStatus.message}
                </AlertDescription>
              </Alert>
            )}

            {/* SPACE OPTIMIZATION: Order Type and Market Price side-by-side */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-muted p-3 rounded-md">
                <div className="text-xs font-medium text-muted-foreground mb-1">Order Type</div>
                <Badge variant="outline" className={`${orderTypeColor} text-xs`}>
                  {isBuyOrder ? 'BUY (Market)' : 'SELL (Market)'}
                </Badge>
              </div>
              
              <div className="bg-muted p-3 rounded-md">
                <div className="text-xs font-medium text-muted-foreground mb-1">Market Price</div>
                <div className={`font-semibold text-sm ${priceError ? 'text-destructive' : ''}`}>{displayMarketPrice}</div>
              </div>
            </div>

            {/* Brokerage Account Selector - Removed redundant Building2 icon */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                Trading Account
              </label>
              {isLoadingAccounts ? (
                <div className="h-10 bg-muted animate-pulse rounded-md" />
              ) : tradeAccounts.length === 0 ? (
                <Alert variant="destructive" className="py-2">
                  <AlertDescription className="text-sm">
                    No trade-enabled accounts connected. Please connect a brokerage account first.
                  </AlertDescription>
                </Alert>
              ) : (
                <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                  <SelectTrigger className="w-full bg-background">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent className="z-[200]">
                    <SelectGroup>
                      {selectedAccountData && (
                        <SelectLabel className="text-xs text-muted-foreground px-2 py-1 flex items-center gap-1">
                          <Wallet className="h-3 w-3" />
                          Available: {formatCurrency(selectedAccountData.buying_power)}
                        </SelectLabel>
                      )}
                      {tradeAccounts.map((account) => (
                        <SelectItem key={account.account_id} value={account.account_id}>
                          <div className="flex items-center justify-between gap-3 w-full">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <div className="font-medium">{account.institution_name}</div>
                                <div className="text-xs text-muted-foreground">{account.account_name}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Wallet className="h-3 w-3" />
                              {formatCurrency(account.buying_power)}
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Show current holdings for sell orders - compact layout for mobile */}
            {isSellOrder && currentQuantity && currentMarketValue && (
              <div className="bg-muted p-3 rounded-md">
                <div className="flex justify-between items-center sm:hidden">
                  <span className="text-sm font-medium text-muted-foreground">Holdings:</span>
                  <div className="text-right">
                    <div className="font-semibold text-sm">{formatCurrency(parseFloat(currentMarketValue))}</div>
                    <div className="text-xs text-muted-foreground">
                      {parseFloat(currentQuantity).toFixed(3)} shares ({maxWholeShares} whole)
                    </div>
                  </div>
                </div>
                <div className="hidden sm:flex justify-between items-center">
                  <span className="text-sm font-medium text-muted-foreground">Your Holdings:</span>
                  <div className="text-right">
                    <div className="font-semibold">{formatCurrency(parseFloat(currentMarketValue))}</div>
                    <div className="text-xs text-muted-foreground">
                      {parseFloat(currentQuantity).toLocaleString()} shares ({maxWholeShares} whole)
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Sell Mode Toggle - Shares vs Dollars */}
            {isSellOrder && (
              <div className="flex gap-1 p-1 bg-muted rounded-lg">
                <button
                  type="button"
                  onClick={() => { setInputMode('shares'); setAmount(''); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                    inputMode === 'shares'
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Hash className="h-4 w-4" />
                  Shares
                </button>
                <button
                  type="button"
                  onClick={() => { setInputMode('dollars'); setAmount(''); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                    inputMode === 'dollars'
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <DollarSign className="h-4 w-4" />
                  Dollars
                </button>
              </div>
            )}

            {priceError && (
              <Alert variant="destructive" className="mt-2">
                <Terminal className="h-4 w-4" />
                <AlertTitle>Price Fetch Error</AlertTitle>
                <AlertDescription>{priceError}</AlertDescription>
              </Alert>
            )}

            <div className="mt-4">
              <label htmlFor="amount" className="block text-sm font-medium text-muted-foreground mb-1">
                {inputMode === 'shares' ? 'Number of Shares' : 'Amount ($)'}
              </label>
              <div className="relative">
                {inputMode === 'shares' && (
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                )}
                {inputMode === 'dollars' && (
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                )}
                <Input
                  id="amount"
                  type="text"
                  inputMode={inputMode === 'shares' ? 'numeric' : 'decimal'}
                  placeholder={inputMode === 'shares' ? '0' : '0.00'}
                  value={amount}
                  onChange={handleInputChange}
                  className="text-center text-xl sm:text-2xl font-bold h-12 sm:h-14 focus-visible:ring-primary pl-10"
                  disabled={isSubmitting}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck="false"
                  data-form-type="other"
                />
              </div>
              {inputMode === 'shares' && marketPrice && parsedAmount > 0 && (
                <div className="text-center text-sm text-muted-foreground mt-1">
                  ≈ {formatCurrency(parsedAmount * marketPrice)}
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 mt-4">
              {(inputMode === 'shares' 
                ? ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']
                : ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫']
              ).map((btn, idx) => (
                btn === '' ? (
                  <div key={idx} className="h-12 sm:h-14" /> // Empty space for grid alignment
                ) : (
                  <Button
                    key={btn}
                    variant="outline"
                    size="lg"
                    className="text-lg sm:text-xl font-semibold h-12 sm:h-14"
                    onClick={() => handleNumberPadInput(btn)}
                  >
                    {btn}
                  </Button>
                )
              ))}
            </div>

            {submitError && (
              <Alert variant="destructive" className="mt-4">
                <Terminal className="h-4 w-4" />
                <AlertTitle>Order Submission Error</AlertTitle>
                <AlertDescription className="text-sm">{submitError}</AlertDescription>
              </Alert>
            )}

            {/* Minimum order amount warning */}
            {isBelowMinimum && (
              <Alert className="mt-4 border-amber-500/50 bg-amber-500/10">
                <AlertDescription className="text-sm text-amber-600 dark:text-amber-400">
                  {inputMode === 'shares' 
                    ? 'You must sell at least 1 whole share. Fractional share selling is not supported by this brokerage.'
                    : `Minimum order amount is $${MINIMUM_ORDER_AMOUNT}. Please enter at least $${MINIMUM_ORDER_AMOUNT} to place an order.`}
                </AlertDescription>
              </Alert>
            )}
            
            {/* Non-whole number warning for shares mode */}
            {inputMode === 'shares' && parsedAmount > 0 && !Number.isInteger(parsedAmount) && (
              <Alert className="mt-4 border-amber-500/50 bg-amber-500/10">
                <AlertDescription className="text-sm text-amber-600 dark:text-amber-400">
                  Please enter a whole number of shares. This brokerage only supports selling whole shares.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 bg-background p-4 border-t sm:px-6 mb-20 sm:mb-0 relative z-[130]">
          <Button 
            type="button"
            size="lg"
            className={`w-full ${!marketStatus.isOpen ? 'bg-gray-400 hover:bg-gray-400' : buttonColorClasses} text-white font-bold text-base sm:text-lg h-12 sm:h-14`}
            onClick={handlePlaceOrder}
            disabled={isSubmitting || isLoadingPrice || !meetsMinimum || !marketStatus.isOpen || (inputMode === 'shares' && !Number.isInteger(parsedAmount))}
          >
            {isSubmitting ? (
              <><Loader2 className="mr-2 h-4 w-4 sm:h-5 sm:w-5 animate-spin" /> Placing Order...</>
            ) : !marketStatus.isOpen ? (
              <><Clock className="mr-2 h-4 w-4" /> Market Closed</>
            ) : isBelowMinimum ? (
              inputMode === 'shares' ? 'Minimum 1 share required' : `Minimum $${MINIMUM_ORDER_AMOUNT} required`
            ) : inputMode === 'shares' && !Number.isInteger(parsedAmount) ? (
              'Whole shares only'
            ) : (
              `Place ${isBuyOrder ? 'Buy' : 'Sell'} Order`
            )}
          </Button>
        </div>
        </DialogContent>
      </Dialog>

    </>
  );
}