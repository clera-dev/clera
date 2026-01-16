'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useCallback } from 'react';
import { Check, X, TrendingUp, TrendingDown, Building2, DollarSign, Loader2, AlertCircle, RefreshCw, Clock, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InterruptConfirmation } from './InterruptConfirmation';
import { isValidReconnectUrl } from '@/utils/url-validation';
import toast from 'react-hot-toast';

// Webull requires a minimum of $5 for fractional share orders
// Must match OrderModal.tsx to prevent broker-level failures
const MINIMUM_ORDER_AMOUNT = 5;
const DEFAULT_LIMIT_BUFFER_PCT = 0.01;

interface TradeAccount {
  account_id: string;
  institution_name: string;
  account_name: string;
  buying_power: number;
  connection_status: 'active' | 'error';
  reconnect_url?: string;
}

interface MarketStatus {
  is_open: boolean;
  status: 'open' | 'closed' | 'pre_market' | 'after_hours';
  message: string;
  next_open: string | null;
  orders_accepted: boolean;
}

interface ParsedTradeDetails {
  action: 'BUY' | 'SELL';
  ticker: string;
  amount: number;
  accountDisplay: string;
  currentPrice: number;
  approximateShares: number;
}

interface TradeInterruptConfirmationProps {
  interrupt: {
    value: string;
    runId: string;
    resumable: boolean;
    ns?: string[];
  };
  onConfirm: (response: string) => void;
  isLoading: boolean;
}

/**
 * Parse trade details from the interrupt confirmation message.
 * Expected format:
 * TRADE CONFIRMATION REQUIRED
 * • BUY $100.00 of AAPL
 * • Trading Account: Webull - Individual Margin
 * • Current Price: $175.07 per share
 * • Approximate Shares: 0.57 shares
 * • Order Type: Market Order
 */
function parseTradeDetails(message: string): ParsedTradeDetails | null {
  try {
    // Check if this is a trade confirmation
    if (!message.includes('TRADE CONFIRMATION REQUIRED')) {
      return null;
    }

    // Parse action (BUY/SELL) and amount
    const actionMatch = message.match(/• (BUY|SELL) \$([0-9,.]+) of ([A-Z]+)/i);
    if (!actionMatch) return null;

    const action = actionMatch[1].toUpperCase() as 'BUY' | 'SELL';
    // Use replaceAll to handle amounts with multiple commas (e.g., $1,000,000)
    const amount = parseFloat(actionMatch[2].replaceAll(',', ''));
    const ticker = actionMatch[3].toUpperCase();

    // Parse account display
    const accountMatch = message.match(/• Trading Account: (.+)/);
    const accountDisplay = accountMatch ? accountMatch[1].trim() : 'Unknown Account';

    // Parse current price (replaceAll for prices like $1,234.56)
    const priceMatch = message.match(/• Current Price: \$([0-9,.]+)/);
    const currentPrice = priceMatch ? parseFloat(priceMatch[1].replaceAll(',', '')) : 0;

    // Parse approximate shares (replaceAll for large share counts)
    const sharesMatch = message.match(/• Approximate Shares: ([0-9,.]+)/);
    const approximateShares = sharesMatch ? parseFloat(sharesMatch[1].replaceAll(',', '')) : 0;

    return {
      action,
      ticker,
      amount,
      accountDisplay,
      currentPrice,
      approximateShares,
    };
  } catch (error) {
    console.error('Error parsing trade details:', error);
    return null;
  }
}

export function TradeInterruptConfirmation({ 
  interrupt, 
  onConfirm, 
  isLoading 
}: TradeInterruptConfirmationProps) {
  const [selectedResponse, setSelectedResponse] = useState<'confirm' | 'cancel' | null>(null);
  
  // Parse initial trade details
  const initialDetails = parseTradeDetails(interrupt.value);
  
  // Editable state
  const [editedAmount, setEditedAmount] = useState<string>(
    initialDetails?.amount.toFixed(2) || '0.00'
  );
  const [editedTicker, setEditedTicker] = useState<string>(
    initialDetails?.ticker || ''
  );
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  // Track the original account ID to detect modifications (comparing IDs, not names)
  const [originalAccountId, setOriginalAccountId] = useState<string>('');
  const [afterHoursPolicy, setAfterHoursPolicy] = useState<'broker_limit_gtc' | 'queue_for_open' | ''>('');
  const [limitPrice, setLimitPrice] = useState('');
  
  // Accounts state
  const [accounts, setAccounts] = useState<TradeAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accountError, setAccountError] = useState<string | null>(null);
  
  // Market status state
  const [marketStatus, setMarketStatus] = useState<MarketStatus | null>(null);
  const [loadingMarketStatus, setLoadingMarketStatus] = useState(true);

  // Fetch market status
  useEffect(() => {
    async function fetchMarketStatus() {
      try {
        setLoadingMarketStatus(true);
        const response = await fetch('/api/snaptrade/market-status', {
          credentials: 'include',
        });
        
        if (response.ok) {
          const data = await response.json();
          setMarketStatus(data.market);
        }
      } catch (error) {
        console.error('Error fetching market status:', error);
      } finally {
        setLoadingMarketStatus(false);
      }
    }
    
    fetchMarketStatus();
  }, []);

  // Fetch available trading accounts
  useEffect(() => {
    async function fetchAccounts() {
      try {
        setLoadingAccounts(true);
        setAccountError(null);
        
        const response = await fetch('/api/snaptrade/trade-enabled-accounts', {
          credentials: 'include',
        });
        
        if (response.ok) {
          const data = await response.json();
          const accountsList = data.accounts || [];
          setAccounts(accountsList);
          
          // Auto-select the first healthy account or match by display name
          if (accountsList.length > 0 && initialDetails) {
            // Try to find matching account by FULL display name
            // CRITICAL: Compare full display name to avoid matching wrong account
            // when user has multiple accounts at same institution (e.g., "Webull - IRA" vs "Webull - Individual Margin")
            const aiDisplayLower = initialDetails.accountDisplay.toLowerCase().trim();
            const matchingAccount = accountsList.find((acc: TradeAccount) => {
              const accDisplayLower = `${acc.institution_name} - ${acc.account_name}`.toLowerCase().trim();
              // First try exact match, then partial (for cases where AI abbreviates)
              return accDisplayLower === aiDisplayLower || 
                     accDisplayLower.includes(aiDisplayLower) ||
                     aiDisplayLower.includes(accDisplayLower);
            });
            
            // Select matching account or first healthy account
            const healthyAccounts = accountsList.filter((acc: TradeAccount) => acc.connection_status === 'active');
            
            // CRITICAL: Always track the AI-suggested account as "original" for modification detection
            // Even if the suggested account is broken, we need to detect that we're using a different one
            if (matchingAccount) {
              // Track the AI's suggestion as the original (even if broken)
              setOriginalAccountId(matchingAccount.account_id);
              
              if (matchingAccount.connection_status === 'active') {
                // AI suggestion is healthy - use it
                setSelectedAccountId(matchingAccount.account_id);
              } else if (healthyAccounts.length > 0) {
                // AI suggestion is broken - fall back to healthy account
                // selectedAccountId != originalAccountId will trigger isModified = true
                setSelectedAccountId(healthyAccounts[0].account_id);
              }
            } else if (healthyAccounts.length > 0) {
              // No matching account found - use first healthy
              // Both will be the same since there's no AI suggestion to track
              setSelectedAccountId(healthyAccounts[0].account_id);
              setOriginalAccountId(healthyAccounts[0].account_id);
            }
          }
        } else {
          setAccountError('Failed to load accounts');
        }
      } catch (error) {
        console.error('Error fetching accounts:', error);
        setAccountError('Error loading accounts');
      } finally {
        setLoadingAccounts(false);
      }
    }
    
    if (initialDetails) {
      fetchAccounts();
    }
  }, [initialDetails?.accountDisplay]);

  // Calculate approximate shares based on edited amount
  const approximateShares = initialDetails && parseFloat(editedAmount) > 0 && initialDetails.currentPrice > 0
    ? parseFloat(editedAmount) / initialDetails.currentPrice
    : 0;

  useEffect(() => {
    if (marketStatus && !marketStatus.is_open && initialDetails?.currentPrice && limitPrice === '') {
      const bufferMultiplier = initialDetails.action === 'BUY' ? (1 + DEFAULT_LIMIT_BUFFER_PCT) : (1 - DEFAULT_LIMIT_BUFFER_PCT);
      const suggestedLimit = Math.max(initialDetails.currentPrice * bufferMultiplier, 0.01);
      setLimitPrice(suggestedLimit.toFixed(2));
    }
  }, [marketStatus, initialDetails, limitPrice]);

  useEffect(() => {
    if (!marketStatus || marketStatus.is_open || !initialDetails?.currentPrice) return;
    if (afterHoursPolicy === 'queue_for_open') {
      const bufferMultiplier = initialDetails.action === 'BUY' ? (1 + DEFAULT_LIMIT_BUFFER_PCT) : (1 - DEFAULT_LIMIT_BUFFER_PCT);
      const suggestedLimit = Math.max(initialDetails.currentPrice * bufferMultiplier, 0.01);
      setLimitPrice(suggestedLimit.toFixed(2));
    }
  }, [afterHoursPolicy, marketStatus, initialDetails]);

  // Check if values have been modified
  // CRITICAL: Compare account_id directly, not institution_name, to detect
  // switching between accounts at the same institution (e.g., "Webull - Margin" vs "Webull - IRA")
  const isAfterHours = !!marketStatus && !marketStatus.is_open;
  const isModified = initialDetails && (
    parseFloat(editedAmount) !== initialDetails.amount ||
    editedTicker !== initialDetails.ticker ||
    (selectedAccountId && originalAccountId && selectedAccountId !== originalAccountId) ||
    (isAfterHours && !!afterHoursPolicy) ||
    (isAfterHours && !!afterHoursPolicy && limitPrice !== '')
  );

  const handleConfirm = useCallback(() => {
    if (isLoading) return;

    if (isAfterHours) {
      if (!afterHoursPolicy) {
        toast.error('Please select how to handle this after-hours order.');
        return;
      }
      if (afterHoursPolicy === 'broker_limit_gtc' || afterHoursPolicy === 'queue_for_open') {
        const parsedLimit = parseFloat(limitPrice);
        if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
          toast.error('Please enter a valid limit price.');
          return;
        }
      }
    }

    setSelectedResponse('confirm');
    
    // Build response - if modified, include the changes
    if ((isModified || isAfterHours) && selectedAccountId) {
      const selectedAccount = accounts.find(a => a.account_id === selectedAccountId);
      const response = JSON.stringify({
        action: 'execute',
        modified: true,
        // IMPORTANT: Trim ticker to match validation - prevents failed trades from whitespace
        ticker: editedTicker.trim().toUpperCase(),
        amount: parseFloat(editedAmount),
        account_id: selectedAccountId,
        account_display: selectedAccount 
          ? `${selectedAccount.institution_name} - ${selectedAccount.account_name}`
          : initialDetails?.accountDisplay,
        after_hours_policy: isAfterHours ? afterHoursPolicy : undefined,
        limit_price: isAfterHours && afterHoursPolicy ? parseFloat(limitPrice) : undefined
      });
      onConfirm(response);
    } else {
      // Simple confirmation
      onConfirm('yes');
    }
  }, [isLoading, isAfterHours, afterHoursPolicy, limitPrice, isModified, editedAmount, editedTicker, selectedAccountId, accounts, initialDetails, onConfirm]);

  const handleCancel = useCallback(() => {
    if (isLoading) return;
    setSelectedResponse('cancel');
    onConfirm('no');
  }, [isLoading, onConfirm]);

  // If parsing failed, fall back to the generic InterruptConfirmation
  // This prevents the UI from getting stuck with no confirmation dialog
  if (!initialDetails) {
    console.warn('TradeInterruptConfirmation: Failed to parse trade details, using fallback');
    return (
      <InterruptConfirmation
        interrupt={interrupt}
        onConfirm={(response: boolean) => onConfirm(response ? 'yes' : 'no')}
        isLoading={isLoading}
      />
    );
  }

  const selectedAccount = accounts.find(a => a.account_id === selectedAccountId);
  const isBuy = initialDetails.action === 'BUY';

  // DRY: Extract validation logic to avoid duplication between disabled prop and className
  // Uses Number.isFinite() to catch both NaN and Infinity (which bypass isNaN check)
  const parsedAmount = parseFloat(editedAmount);
  const isValidTicker = editedTicker.trim() && /^[A-Za-z0-9]+$/.test(editedTicker.trim());
  // Use same minimum as OrderModal ($5 for Webull fractional shares)
  const isValidAmount = Number.isFinite(parsedAmount) && parsedAmount >= MINIMUM_ORDER_AMOUNT;
  const parsedLimit = parseFloat(limitPrice);
  const isValidLimit = !isAfterHours || !afterHoursPolicy || (Number.isFinite(parsedLimit) && parsedLimit > 0);
  const isValidPolicy = !isAfterHours || !!afterHoursPolicy;
  const isSubmitDisabled = isLoading || !selectedAccountId || !isValidTicker || !isValidAmount || !isValidPolicy || !isValidLimit;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        transition={{ type: "spring", duration: 0.4, bounce: 0.3 }}
        className="relative w-full max-w-xl mx-auto"
      >
        {/* Backdrop blur effect */}
        <div className={`absolute inset-0 rounded-2xl blur-xl ${
          isBuy 
            ? 'bg-gradient-to-r from-green-500/10 to-emerald-500/10' 
            : 'bg-gradient-to-r from-red-500/10 to-orange-500/10'
        }`} />
        
        {/* Main container */}
        <div className="relative bg-white/95 dark:bg-gray-900/95 backdrop-blur-lg border border-gray-200/50 dark:border-gray-700/50 rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className={`px-6 py-4 ${
            isBuy 
              ? 'bg-gradient-to-r from-green-500 to-emerald-600' 
              : 'bg-gradient-to-r from-red-500 to-orange-600'
          }`}>
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                {isBuy ? (
                  <TrendingUp className="w-5 h-5 text-white" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-white" />
                )}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">
                  {initialDetails.action} Order Confirmation
                </h3>
                <p className="text-sm text-white/80">
                  Review and customize your trade
                </p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-5">
            {/* Stock Ticker */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Stock Symbol
              </label>
              <Input
                type="text"
                value={editedTicker}
                onChange={(e) => setEditedTicker(e.target.value.toUpperCase())}
                className="text-lg font-bold tracking-wider"
                placeholder="AAPL"
              />
            </div>

            {/* Dollar Amount */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Amount ($)
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="number"
                  step="0.01"
                  min={MINIMUM_ORDER_AMOUNT}
                  value={editedAmount}
                  onChange={(e) => setEditedAmount(e.target.value)}
                  className="pl-9 text-lg font-semibold"
                  placeholder="0.00"
                />
              </div>
              {approximateShares > 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  ≈ {approximateShares.toFixed(4)} shares at ${initialDetails.currentPrice.toFixed(2)}/share
                </p>
              )}
            </div>

            {/* Trading Account */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Trading Account
              </label>
              {loadingAccounts ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading accounts...
                </div>
              ) : accountError ? (
                <div className="flex items-center gap-2 text-sm text-red-500 p-3 rounded-lg bg-red-50 dark:bg-red-900/20">
                  <AlertCircle className="w-4 h-4" />
                  {accountError}
                </div>
              ) : (
                <Select 
                  value={selectedAccountId} 
                  onValueChange={(value) => {
                    const account = accounts.find(a => a.account_id === value);
                    if (account?.connection_status === 'error') {
                      // SECURITY: Validate URL before opening
                      if (account.reconnect_url && isValidReconnectUrl(account.reconnect_url)) {
                        window.open(account.reconnect_url, '_blank', 'noopener,noreferrer');
                      } else {
                        toast.error('Unable to reconnect. Please try from the Dashboard.');
                      }
                      return;
                    }
                    setSelectedAccountId(value);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select an account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem 
                        key={account.account_id} 
                        value={account.account_id}
                        disabled={account.connection_status === 'error'}
                      >
                        <div className="flex items-center justify-between w-full gap-3">
                          <div className="flex items-center gap-2">
                            {account.connection_status === 'error' ? (
                              <AlertCircle className="w-4 h-4 text-destructive" />
                            ) : (
                              <Building2 className="w-4 h-4 text-muted-foreground" />
                            )}
                            <div>
                              <span className="font-medium">{account.institution_name}</span>
                              <span className="text-xs text-muted-foreground ml-2">
                                {account.connection_status === 'error' 
                                  ? '(Needs reconnect)' 
                                  : account.account_name
                                }
                              </span>
                            </div>
                          </div>
                          {account.connection_status === 'active' && (
                            <span className="text-xs text-muted-foreground">
                              ${account.buying_power.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          )}
                          {account.connection_status === 'error' && (
                            <RefreshCw className="w-3 h-3 text-destructive" />
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedAccount && selectedAccount.connection_status === 'active' && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Available: ${selectedAccount.buying_power.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              )}
            </div>

            {/* Modified indicator */}
            {isModified && (
              <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded-lg">
                <AlertCircle className="w-3 h-3" />
                Trade details have been modified from Clera's suggestion
              </div>
            )}

            {/* Market Status Indicator */}
            {!loadingMarketStatus && marketStatus && (
              <div className={`flex items-center gap-2 text-xs p-3 rounded-lg ${
                marketStatus.is_open 
                  ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20' 
                  : 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20'
              }`}>
                {marketStatus.is_open ? (
                  <>
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="font-medium">Market Open</span>
                    <span className="text-gray-500 dark:text-gray-400">• Your order will execute immediately</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-4 h-4" />
                    <div className="flex-1">
                      <span className="font-medium">
                        {marketStatus.status === 'pre_market' ? 'Pre-Market' : 
                         marketStatus.status === 'after_hours' ? 'After-Hours' : 'Market Closed'}
                      </span>
                      <span className="block text-gray-500 dark:text-gray-400 mt-0.5">
                        {afterHoursPolicy === 'broker_limit_gtc'
                          ? 'Limit order will be submitted to your broker for after-hours execution.'
                          : afterHoursPolicy === 'queue_for_open'
                            ? `Order will be queued with a protective limit of $${limitPrice || '--'} (${DEFAULT_LIMIT_BUFFER_PCT * 100}% buffer). If the price moves significantly overnight or the order is older than 24 hours, we will cancel and notify you.`
                            : 'Select how to handle this after-hours order.'}
                        {marketStatus.next_open && (
                          <span className="ml-1">
                            ({new Date(marketStatus.next_open).toLocaleString('en-US', { 
                              weekday: 'short', 
                              hour: 'numeric', 
                              minute: '2-digit',
                              timeZoneName: 'short'
                            })})
                          </span>
                        )}
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}

            {marketStatus && !marketStatus.is_open && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  After-hours handling
                </label>
                <Select value={afterHoursPolicy} onValueChange={(value) => setAfterHoursPolicy(value as 'broker_limit_gtc' | 'queue_for_open')}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select how to handle after-hours" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="broker_limit_gtc">Limit order (broker queues)</SelectItem>
                    <SelectItem value="queue_for_open">Queue for market open (Clera)</SelectItem>
                  </SelectContent>
                </Select>

                {(afterHoursPolicy === 'broker_limit_gtc' || afterHoursPolicy === 'queue_for_open') && (
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500 dark:text-gray-400">
                      {afterHoursPolicy === 'queue_for_open' ? 'Protective limit price' : 'Limit price'}
                    </label>
                    <Input
                      value={limitPrice}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (/^\d*\.?\d*$/.test(value)) {
                          setLimitPrice(value);
                        }
                      }}
                      placeholder="Enter limit price"
                      inputMode="decimal"
                      readOnly={afterHoursPolicy === 'queue_for_open'}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {afterHoursPolicy === 'queue_for_open'
                        ? `Automatically set using a ${DEFAULT_LIMIT_BUFFER_PCT * 100}% buffer from last price.`
                        : `Suggested using a ${DEFAULT_LIMIT_BUFFER_PCT * 100}% buffer from last price.`}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Order Type Info */}
            <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
              <p className="font-medium mb-1">
                Order Type: {isAfterHours && afterHoursPolicy ? 'Limit Order' : 'Market Order'}
              </p>
              <p>⚠️ Final price and shares may vary due to market movements.</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="px-6 pb-6 flex items-center justify-center gap-4">
            {/* Cancel button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleCancel}
              disabled={isLoading}
              className={`
                relative overflow-hidden px-6 py-3 rounded-xl font-medium transition-all duration-200
                ${selectedResponse === 'cancel' 
                  ? 'bg-red-500 text-white shadow-lg shadow-red-500/25' 
                  : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                }
                ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                border border-gray-200 dark:border-gray-700
              `}
            >
              <div className="flex items-center space-x-2">
                <X className="w-4 h-4" />
                <span>Cancel</span>
              </div>
              {selectedResponse === 'cancel' && isLoading && (
                <motion.div
                  className="absolute inset-0 bg-white/20"
                  initial={{ x: '-100%' }}
                  animate={{ x: '100%' }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
              )}
            </motion.button>

            {/* Confirm button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleConfirm}
              disabled={isSubmitDisabled}
              className={`
                relative overflow-hidden px-6 py-3 rounded-xl font-medium transition-all duration-200
                ${selectedResponse === 'confirm' 
                  ? 'bg-green-500 text-white shadow-lg shadow-green-500/25' 
                  : isBuy
                    ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-lg shadow-green-500/25'
                    : 'bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 text-white shadow-lg shadow-red-500/25'
                }
                ${isSubmitDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              <div className="flex items-center space-x-2">
                <Check className="w-4 h-4" />
                <span>Execute {initialDetails.action}</span>
              </div>
              {selectedResponse === 'confirm' && isLoading && (
                <motion.div
                  className="absolute inset-0 bg-white/20"
                  initial={{ x: '-100%' }}
                  animate={{ x: '100%' }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
              )}
            </motion.button>
          </div>

          {/* Loading indicator */}
          <AnimatePresence>
            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/50 flex items-center justify-center"
              >
                <div className="flex items-center space-x-2 text-white">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Processing trade...</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Check if an interrupt message is a trade confirmation
 */
export function isTradeInterrupt(message: string): boolean {
  return message.includes('TRADE CONFIRMATION REQUIRED');
}

