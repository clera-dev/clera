'use client';

import { useState, useEffect } from 'react';
import StockSearchBar from '@/components/invest/StockSearchBar';
import StockInfoCard from '@/components/invest/StockInfoCard';
import OrderModal from '@/components/invest/OrderModal';
import StockWatchlist from '@/components/invest/StockWatchlist';
import StockPicksCard from '@/components/invest/StockPicksCard';
import InvestmentIdeasCard from '@/components/invest/InvestmentIdeasCard';
import ResearchSourcesCard from '@/components/invest/ResearchSourcesCard';



import { Button } from '@/components/ui/button';
import { Toaster } from 'react-hot-toast';
import { formatCurrency, getAlpacaAccountId } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";
import { useSidebarCollapse } from "@/components/ClientLayout";
import { useCleraAssist } from "@/components/ui/clera-assist-provider";
import { useWeeklyStockPicks } from "@/hooks/useWeeklyStockPicks";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, X, Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// React DevTools might be causing the floating icon
// This ensures any dev tools elements are properly handled
const cleanupDevTools = () => {
  if (typeof window !== 'undefined') {
    // Remove any floating debug elements that might be in the DOM
    const floatingElements = document.querySelectorAll('[id*="react-devtools"]');
    floatingElements.forEach(el => el.remove());
  }
};

interface BalanceData {
  buying_power: number;
  cash: number;
  portfolio_value: number;
  currency: string;
}



export default function InvestPage() {
  const { sideChatVisible } = useCleraAssist();
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [availableBalance, setAvailableBalance] = useState<BalanceData | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoadingAccountId, setIsLoadingAccountId] = useState(true);
  const [watchlistSymbols, setWatchlistSymbols] = useState<Set<string>>(new Set());
  const [watchlistVersion, setWatchlistVersion] = useState(0);
  
  // Portfolio mode detection for conditional invest functionality
  const [portfolioMode, setPortfolioMode] = useState<string>('loading');
  const [tradingEnabled, setTradingEnabled] = useState<boolean>(true);
  
  // Weekly stock picks data using the new hook
  const { 
    data: weeklyPicksData, 
    isLoading: isLoadingWeeklyPicks, 
    error: weeklyPicksError, 
    lastGenerated: weeklyPicksLastGenerated,
    isFallback: isUsingFallbackPicks,
    isNewUser: isNewUserForPicks
  } = useWeeklyStockPicks();
  

  
  
  // Get sidebar collapse function
  const { autoCollapseSidebar } = useSidebarCollapse();

  // Use effect to cleanup any dev tools or floating elements
  useEffect(() => {
    cleanupDevTools();

    // Additional cleanup for other potential floating elements
    const rootElement = document.documentElement;
    const cleanupBodyChildren = () => {
      // Find and remove any suspicious floating elements at the bottom right
      const bodyChildren = document.body.children;
      Array.from(bodyChildren).forEach(child => {
        const rect = child.getBoundingClientRect();
        const isAtBottomRight = 
          rect.bottom > rootElement.clientHeight - 100 && 
          rect.right > rootElement.clientWidth - 100;
        
        // If it's not a standard UI element and positioned at bottom right
        // Also ensure it's not a Radix UI portal or popper content wrapper
        if (isAtBottomRight && 
            !child.id?.includes('root') && 
            !child.classList.contains('Toaster') &&
            !child.hasAttribute('data-radix-portal') && 
            !(child.hasAttribute('data-radix-popper-content-wrapper') || child.hasAttribute('data-radix-dialog-content'))
            ) {
          // Check if it's likely a dev tool
          if (child.shadowRoot || 
              child.tagName.includes('-') || 
              (!child.classList.length && !Object.keys((child as HTMLElement).dataset).some(key => key.startsWith('radix')))
            ) {
            child.remove();
          }
        }
      });
    };
    
    cleanupBodyChildren();
    return () => {};
  }, []);

  // Determine if we should use stacked layout based on chat state
  // When chat is open, we need higher breakpoints to prevent squishing
  const shouldUseStackedLayout = sideChatVisible;
  
  // Fetch portfolio mode to determine trading functionality availability
  const fetchPortfolioMode = async () => {
    try {
      const response = await fetch('/api/portfolio/connection-status');
      if (response.ok) {
        const data = await response.json();
        const mode = data.portfolio_mode || 'aggregation';
        setPortfolioMode(mode);
        // PRODUCTION-GRADE: Trading is ALWAYS enabled with SnapTrade
        // Aggregation mode users can trade via SnapTrade connected accounts
        // Brokerage mode users can trade via Alpaca
        // Hybrid mode users can trade via both
        setTradingEnabled(true);
      } else {
        // Default to aggregation mode - most users use SnapTrade now
        // Let OrderModal handle account detection
        console.log('Portfolio connection-status returned non-OK, defaulting to aggregation mode');
        setPortfolioMode('aggregation');
        setTradingEnabled(true);
      }
    } catch (error) {
      console.error('Error fetching portfolio mode:', error);
      // Default to aggregation mode - most users use SnapTrade now
      // Let OrderModal handle account detection
      setPortfolioMode('aggregation');
      setTradingEnabled(true);
    }
  };
  
  // Fetch portfolio mode on mount
  useEffect(() => {
    fetchPortfolioMode();
  }, []);
  
  // Fetch user ID for watchlist functionality
  // IMPORTANT: userId ensures watchlist refreshes when user changes (prevents stale data)
  useEffect(() => {
    const fetchUserId = async () => {
      try {
        const supabase = createClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        if (user && !error) {
          setUserId(user.id);
        }
      } catch (error) {
        console.error('Error fetching user ID:', error);
      }
    };
    fetchUserId();
  }, []);
  
  // Fetch account ID after portfolio mode is determined
  useEffect(() => {
    const fetchAndSetAccountId = async () => {
      // PRODUCTION-GRADE: With SnapTrade, we don't need Alpaca account in aggregation mode
      // Skip Alpaca setup entirely for aggregation users
      if (portfolioMode === 'aggregation') {
        setIsLoadingAccountId(false);
        setAccountId(null);  // No Alpaca account needed
        setAvailableBalance(null);  // OrderModal fetches SnapTrade accounts
        setBalanceError(null);  // Clear any errors
        return;
      }

      // Only fetch Alpaca account for brokerage/hybrid mode
      setIsLoadingAccountId(true);
      setBalanceError(null);
      try {
        const fetchedAccountId = await getAlpacaAccountId();
        if (fetchedAccountId) {
          setAccountId(fetchedAccountId);
        } else {
          console.warn("Alpaca Account ID not found for brokerage mode.");
          setBalanceError("Alpaca account ID not found. Please complete onboarding or check your connection.");
        }
      } catch (error) {
        console.error("Error fetching Alpaca Account ID in InvestPage:", error);
        setBalanceError("Failed to retrieve Alpaca Account ID. Please try again.");
      } finally {
        setIsLoadingAccountId(false);
      }
    };

    // Only fetch account ID after portfolio mode is determined
    if (portfolioMode !== 'loading') {
      fetchAndSetAccountId();
    }
  }, [portfolioMode]);

  useEffect(() => {
    if (!accountId || isLoadingAccountId || !tradingEnabled) return;

    const fetchBalance = async () => {
        setIsLoadingBalance(true);
        setBalanceError(null);
        try {
            const response = await fetch(`/api/account/${accountId}/balance`);
            if (!response.ok) {
                const errorData = await response.json();
                console.error("Balance API error response:", errorData);
                throw new Error(errorData.message || `Failed to fetch balance: ${response.statusText}`);
            }
            const result = await response.json();
            if (result.success && result.data) {
                setAvailableBalance(result.data);
            } else {
                 throw new Error(result.message || 'Failed to parse balance data.');
            }
        } catch (error: any) {
            console.error("Error fetching account balance:", error);
            setBalanceError(error.message || 'Could not load available balance.');
            setAvailableBalance(null);
        } finally {
            setIsLoadingBalance(false);
        }
    };

    fetchBalance();
  }, [accountId, isLoadingAccountId, tradingEnabled]);



  const handleStockSelect = (symbol: string) => {
    // Auto-collapse sidebar when stock dialog opens
    autoCollapseSidebar();
    setSelectedSymbol(symbol);
  };

  const handleOpenModal = () => {
    // PRODUCTION-GRADE: Open modal if symbol is selected and trading is enabled
    // Modal handles account selection and balance checks internally
    if (selectedSymbol && tradingEnabled) {
      setIsModalOpen(true);
    }
  };

  // Wrapper component for locked invest button with tooltip
  const LockedInvestButton = ({ 
    children, 
    size = "lg", 
    className = "", 
    disabled = false 
  }: { 
    children: React.ReactNode; 
    size?: "default" | "lg"; 
    className?: string;
    disabled?: boolean;
  }) => {
    // PRODUCTION-GRADE: Trading is always enabled with SnapTrade
    // Modal handles account selection and balance checks
    if (tradingEnabled) {
      return (
        <Button 
          size={size} 
          className={className}
          onClick={handleOpenModal}
          disabled={disabled}
        >
          {children}
        </Button>
      );
    }

    // Locked state for aggregation mode
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              size={size} 
              className={`${className} opacity-50 cursor-not-allowed`}
              disabled={true}
            >
              <Lock className="h-4 w-4 mr-2" />
              {children}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="text-sm">
              <strong>Brokerage capabilities coming soon!</strong><br />
              You can view your external investment accounts now, and trading features will be available soon.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  // Fetch watchlist data using user-based API (works for both aggregation and brokerage modes)
  const fetchWatchlist = async () => {
    try {
      // PRODUCTION-GRADE: Use user-based watchlist API instead of accountId-based
      // This works for both SnapTrade (aggregation) and Alpaca (brokerage) users
      const response = await fetch(`/api/user/watchlist`);
      if (response.ok) {
        const data = await response.json();
        setWatchlistSymbols(new Set(data.symbols || []));
      }
    } catch (error) {
      console.error('Error fetching watchlist:', error);
    }
  };

  const refreshWatchlist = () => {
    fetchWatchlist();
    setWatchlistVersion(prev => prev + 1);
  };

  const handleWatchlistChange = (symbol: string, action: 'add' | 'remove') => {
    setWatchlistSymbols(prev => {
      const newSet = new Set(prev);
      if (action === 'add') {
        newSet.add(symbol);
      } else {
        newSet.delete(symbol);
      }
      return newSet;
    });
    setWatchlistVersion(prev => prev + 1);
  };

  const optimisticAddToWatchlist = (symbol: string) => {
    handleWatchlistChange(symbol, 'add');
  };

  const optimisticRemoveFromWatchlist = (symbol: string) => {
    handleWatchlistChange(symbol, 'remove');
  };

  // Load watchlist on mount, when portfolio mode is determined, and when user changes
  // PRODUCTION-GRADE: User-based watchlist API works regardless of accountId
  // IMPORTANT: Include userId so watchlist refreshes when user changes (prevents stale data)
  useEffect(() => {
    if (portfolioMode !== 'loading') {
      if (userId) {
        fetchWatchlist();
      } else {
        // Clear watchlist when no user (logged out)
        setWatchlistSymbols(new Set());
      }
    }
  }, [portfolioMode, userId]);

  if (isLoadingAccountId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p>Loading account details...</p>
      </div>
    );
  }

  // PRODUCTION-GRADE: Only show account error for brokerage mode
  // Aggregation mode users don't need Alpaca accounts - they use SnapTrade
  if (!accountId && balanceError && portfolioMode === 'brokerage') {
     return (
        <div className="flex items-center justify-center h-full p-4">
            <Alert variant="destructive" className="max-w-md">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Account Error</AlertTitle>
                <AlertDescription>
                    {balanceError}
                </AlertDescription>
            </Alert>
        </div>
     );
  }

  return (
    <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="py-4 space-y-6 bg-background text-foreground w-full h-full">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold">Discover Your Investment Opportunities</h1>
            <p className="text-lg text-muted-foreground mt-1">Find and research stocks to build your portfolio</p>
          </div>
        </div>
        
        <Toaster 
          position="bottom-center"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#1f2937',
              color: '#fff',
              border: '1px solid #374151',
              borderRadius: '0.5rem',
              fontSize: '14px',
              padding: '12px 16px',
              zIndex: 99999,
              marginBottom: '100px', // Space above mobile bottom nav (80px + 20px margin)
            },
            className: 'mobile-toast',
            success: {
              iconTheme: {
                primary: '#10b981',
                secondary: '#fff',
              },
            },
            error: {
              iconTheme: {
                primary: '#ef4444',
                secondary: '#fff',
              },
            },
            loading: {
              iconTheme: {
                primary: '#6b7280',
                secondary: '#fff',
              },
            },
          }}
        />
        
        {/* Search Bar Section */}
        <StockSearchBar 
          onStockSelect={handleStockSelect} 
          accountId={accountId}
          userId={userId}
          watchlistSymbols={watchlistSymbols}
          onWatchlistChange={refreshWatchlist}
          onOptimisticAdd={optimisticAddToWatchlist}
        />
        
        
        {/* Balance Error Alert */}
        {!isLoadingBalance && balanceError && !isLoadingAccountId && (
          <Alert variant="default" className="bg-amber-50 border-amber-200 text-amber-800">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Account Information Unavailable</AlertTitle>
              <AlertDescription>
                  We're having trouble connecting to your account data. You can still browse investments, but buying functionality may be limited.
              </AlertDescription>
          </Alert>
        )}

        {/* Main Content Layout */}
        {shouldUseStackedLayout ? (
          /* Stacked Layout for Chat Mode / Narrow Screens */
          <div className="space-y-6">
            {/* Stock Watchlist - First in stacked layout */}
            <StockWatchlist 
              accountId={accountId}
              userId={userId}
              onStockSelect={handleStockSelect}
              watchlistSymbols={watchlistSymbols}
              onWatchlistChange={refreshWatchlist}
              onOptimisticAdd={optimisticAddToWatchlist}
              onOptimisticRemove={optimisticRemoveFromWatchlist}
            />
            
            {/* Stock Picks - Second in stacked layout - Now using personalized weekly picks */}
            <StockPicksCard
              stockPicks={weeklyPicksData?.stock_picks || []}
              onStockSelect={handleStockSelect}
              lastGenerated={weeklyPicksLastGenerated ? new Date(weeklyPicksLastGenerated).toLocaleDateString() : null}
              isLoading={isLoadingWeeklyPicks}
              isNewUser={isNewUserForPicks}
            />
            
            {/* Investment Ideas - Third in stacked layout */}
            <InvestmentIdeasCard
              investmentThemes={weeklyPicksData?.investment_themes || []}
              onStockSelect={handleStockSelect}
              onThemeSelect={autoCollapseSidebar}
              isLoading={isLoadingWeeklyPicks}
              isNewUser={isNewUserForPicks}
            />
            
            {/* Research Sources - Fourth in stacked layout */}
            <ResearchSourcesCard
              citations={weeklyPicksData?.citations || []}
              isLoading={isLoadingWeeklyPicks}
              isNewUser={isNewUserForPicks}
            />
          </div>
        ) : (
          /* Desktop Layout: Optimized Grid Structure */
          <div className="space-y-6">
            {/* Top Row: Stock Picks (left) + Stock Watchlist (right) - 50/50 split */}
            <div className={`grid grid-cols-1 gap-6 ${
              sideChatVisible 
                ? '2xl:grid-cols-2' // When chat is open, only go horizontal on 2xl+ screens
                : 'lg:grid-cols-2' // When chat is closed, use standard lg breakpoint
            }`}>
              <StockPicksCard
                stockPicks={weeklyPicksData?.stock_picks || []}
                onStockSelect={handleStockSelect}
                lastGenerated={weeklyPicksLastGenerated ? new Date(weeklyPicksLastGenerated).toLocaleDateString() : null}
                isLoading={isLoadingWeeklyPicks}
                isNewUser={isNewUserForPicks}
              />
              <StockWatchlist 
                accountId={accountId}
                userId={userId}
                onStockSelect={handleStockSelect}
                watchlistSymbols={watchlistSymbols}
                onWatchlistChange={refreshWatchlist}
                onOptimisticAdd={optimisticAddToWatchlist}
                onOptimisticRemove={optimisticRemoveFromWatchlist}
              />
            </div>
            
            {/* Bottom Row: Investment Ideas (2/3) + Research Sources (1/3) */}
            <div className={`grid grid-cols-1 gap-6 items-stretch ${
              sideChatVisible 
                ? '2xl:grid-cols-3' // When chat is open, only go horizontal on 2xl+ screens
                : 'xl:grid-cols-3' // When chat is closed, use standard xl breakpoint
            }`}>
              <div className={`${
                sideChatVisible 
                  ? '2xl:col-span-2' // When chat is open, take 2/3 of the 2xl grid
                  : 'xl:col-span-2' // When chat is closed, take 2/3 of the xl grid
              }`}>
                <InvestmentIdeasCard
                  investmentThemes={weeklyPicksData?.investment_themes || []}
                  onStockSelect={handleStockSelect}
                  onThemeSelect={autoCollapseSidebar}
                  isLoading={isLoadingWeeklyPicks}
                  isNewUser={isNewUserForPicks}
                />
              </div>
              <div className={`${
                sideChatVisible 
                  ? '2xl:col-span-1' // When chat is open, take 1/3 of the 2xl grid
                  : 'xl:col-span-1' // When chat is closed, take 1/3 of the xl grid
              }`}>
                <ResearchSourcesCard
                  citations={weeklyPicksData?.citations || []}
                  isLoading={isLoadingWeeklyPicks}
                  isNewUser={isNewUserForPicks}
                />
              </div>
            </div>
          </div>
        )}



        {/* Stock Information Dialog */}
        <Dialog open={!!selectedSymbol} onOpenChange={(open) => !open && setSelectedSymbol(null)}>
          <DialogContent className="w-[100vw] h-[calc(100vh_-_var(--mobile-nav-height,_80px))] sm:w-[95vw] sm:h-[95vh] lg:max-w-[70vw] xl:max-w-[60vw] p-0 sm:max-h-[90vh] overflow-hidden border-0 shadow-xl sm:rounded-lg left-0 top-0 sm:left-1/2 sm:top-1/2 translate-x-0 translate-y-0 sm:-translate-x-1/2 sm:-translate-y-1/2 z-[50] flex flex-col">
            <DialogHeader className="bg-slate-950 p-4 flex flex-row items-center justify-between sticky top-0 z-10 border-b border-slate-800">
              <DialogTitle className="text-white text-xl font-semibold">{selectedSymbol}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto min-h-0 pb-1 lg:pb-0">
              {selectedSymbol && (
                <StockInfoCard 
                  symbol={selectedSymbol} 
                  accountId={accountId}
                  userId={userId}
                  isInWatchlist={watchlistSymbols.has(selectedSymbol)}
                  onWatchlistChange={refreshWatchlist}
                  onOptimisticAdd={optimisticAddToWatchlist}
                  onOptimisticRemove={optimisticRemoveFromWatchlist}
                />
              )}
            </div>
            
            {/* Desktop Action Footer - Fixed at bottom (hidden when trading disabled) */}
            {/* PRODUCTION-GRADE: Always show Invest button - modal handles account selection */}
            {selectedSymbol && tradingEnabled && (
              <div className="hidden lg:flex flex-shrink-0 bg-background border-t border-border p-4 items-center justify-between shadow-md">
                <div className="text-left">
                  <p className="text-lg font-bold">Select Brokerage Account</p>
                  <p className="text-sm text-muted-foreground">Choose account in next step</p>
                </div>
                <LockedInvestButton 
                  size="lg" 
                  className="font-semibold text-lg px-8 py-3"
                >
                  $ Invest
                </LockedInvestButton>
              </div>
            )}

            {/* Mobile Action Footer - Sticky bottom positioning (hidden when trading disabled) */}
            {/* PRODUCTION-GRADE: Always show Invest button - modal handles account selection */}
            {selectedSymbol && tradingEnabled && (
              <div className="lg:hidden sticky bottom-0 left-0 right-0 mt-auto bg-background border-t border-border p-3 flex items-center justify-between shadow-md z-10">
                <div className="text-left min-w-0 flex-1">
                  <p className="text-base font-bold">Select Account</p>
                  <p className="text-xs text-muted-foreground">Choose in next step</p>
                </div>
                <LockedInvestButton 
                  size="default" 
                  className="font-semibold text-base px-6 py-2 ml-3 flex-shrink-0"
                >
                  $ Invest
                </LockedInvestButton>
              </div>
            )}

          </DialogContent>
        </Dialog>

        {/* Order Modal - works in both aggregation and brokerage mode */}
        {/* PRODUCTION-GRADE: Modal handles account selection internally */}
        {selectedSymbol && tradingEnabled && (
          <OrderModal 
              isOpen={isModalOpen} 
              onClose={handleCloseModal} 
              symbol={selectedSymbol} 
              accountId={accountId}
              orderType="BUY"
              onTradeSuccess={() => {
                handleCloseModal();
                setSelectedSymbol(null); // Close security card
              }}
          />
        )}
      </div>


    </div>
  );
} 