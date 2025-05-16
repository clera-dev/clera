'use client';

import { useState, useEffect } from 'react';
import StockSearchBar from '@/components/invest/StockSearchBar';
import StockInfoCard from '@/components/invest/StockInfoCard';
import BuyOrderModal from '@/components/invest/BuyOrderModal';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Toaster } from 'react-hot-toast';
import { formatCurrency, getAlpacaAccountId } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal, TrendingUp, Lightbulb, Atom, Crown, Landmark, Clock, PlusCircle, Search, AlertCircle, X } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose
} from "@/components/ui/dialog";

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

interface StockPick {
  symbol: string;
  name?: string;
  ytdReturn: string;
  buyRating: string;
  color?: string;
}

interface InvestmentIdea {
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

export default function InvestPage() {
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [availableBalance, setAvailableBalance] = useState<BalanceData | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isLoadingAccountId, setIsLoadingAccountId] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);

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

  // Use effect to check if side chat is open
  useEffect(() => {
    const checkChatPanel = () => {
      // Look for chat panel elements
      const chatPanel = document.querySelector('[role="dialog"]') || 
                        document.querySelector('.chat-panel') ||
                        document.querySelector('[class*="chat"]');
      setIsChatOpen(!!chatPanel && window.innerWidth < 1500);
    };

    // Initial check
    checkChatPanel();

    // Set up observer to detect DOM changes that might indicate chat panel opened/closed
    const observer = new MutationObserver(checkChatPanel);
    observer.observe(document.body, { childList: true, subtree: true });

    // Also check on resize
    window.addEventListener('resize', checkChatPanel);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', checkChatPanel);
    };
  }, []);

  // Mock data for top stock picks
  const topStockPicks: StockPick[] = [
    { symbol: 'MSFT', name: 'Microsoft', ytdReturn: '14.85%', buyRating: '4.86/5' },
    { symbol: 'AAPL', name: 'Apple', ytdReturn: '16.36%', buyRating: '4.02/5' },
    { symbol: 'SPY', name: 'S&P 500 ETF', ytdReturn: '7.46%', buyRating: '3.97/5' },
    { symbol: 'SPSB', name: 'SPDR Short Term Corporate Bond ETF', ytdReturn: '3.59%', buyRating: '4.38/5' },
    { symbol: 'TSLA', name: 'Tesla', ytdReturn: '17.81%', buyRating: '4.42/5' },
    { symbol: 'UNH', name: 'UnitedHealth Group', ytdReturn: '9.08%', buyRating: '4.93/5' },
  ];

  // Investment ideas with icons
  const investmentIdeas: InvestmentIdea[] = [
    {
      title: "High-Growth Tech Stocks",
      description: "Explore cutting-edge technology companies with high-growth potential",
      icon: <Atom className="h-20 w-20" />,
      color: "bg-blue-100 dark:bg-blue-900/30"
    },
    {
      title: "Dividend Royalty",
      description: "Invest in companies with a history of consistently increasing their dividends",
      icon: <Crown className="h-20 w-20" />,
      color: "bg-pink-100 dark:bg-pink-900/30"
    },
    {
      title: "Short Term Bond ETFs",
      description: "Explore low-risk, stable income generating short-term bond ETFs for low-risk return",
      icon: <Landmark className="h-20 w-20" />,
      color: "bg-purple-100 dark:bg-purple-900/30" 
    },
    {
      title: "Medical Technology Gems",
      description: "Explore the rapidly innovating intersection of new age technology and healthcare",
      icon: <PlusCircle className="h-20 w-20" />,
      color: "bg-yellow-100 dark:bg-yellow-900/30"
    }
  ];

  useEffect(() => {
    const fetchAndSetAccountId = async () => {
      setIsLoadingAccountId(true);
      setBalanceError(null);
      try {
        const fetchedAccountId = await getAlpacaAccountId();
        if (fetchedAccountId) {
          setAccountId(fetchedAccountId);
        } else {
          console.warn("Alpaca Account ID not found. Cannot fetch balance or place trades.");
          setBalanceError("Alpaca account ID not found. Please complete onboarding or check your connection.");
        }
      } catch (error) {
        console.error("Error fetching Alpaca Account ID in InvestPage:", error);
        setBalanceError("Failed to retrieve Alpaca Account ID. Please try again.");
      } finally {
        setIsLoadingAccountId(false);
      }
    };

    fetchAndSetAccountId();
  }, []);

  useEffect(() => {
    if (!accountId || isLoadingAccountId) return;

    const fetchBalance = async () => {
        setIsLoadingBalance(true);
        setBalanceError(null);
        try {
            console.log(`Fetching balance for account: ${accountId}`);
            const response = await fetch(`/api/account/${accountId}/balance`);
            if (!response.ok) {
                const errorData = await response.json();
                console.error("Balance API error response:", errorData);
                throw new Error(errorData.message || `Failed to fetch balance: ${response.statusText}`);
            }
            const result = await response.json();
            console.log("Balance API success response:", result);
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

  }, [accountId, isLoadingAccountId]);

  const handleStockSelect = (symbol: string) => {
    setSelectedSymbol(symbol);
    // Open modal instead of scrolling
  };

  const handleOpenModal = () => {
    if (selectedSymbol && accountId && !isLoadingAccountId && !isLoadingBalance) {
      setIsModalOpen(true);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleStockPickClick = (symbol: string) => {
    setSelectedSymbol(symbol);
    // Open modal instead of scrolling
  };

  if (isLoadingAccountId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p>Loading account details...</p>
      </div>
    );
  }

  if (!accountId && balanceError) {
     return (
        <div className="flex items-center justify-center h-full p-4">
            <Alert variant="destructive" className="max-w-md">
                <Terminal className="h-4 w-4" />
                <AlertTitle>Account Error</AlertTitle>
                <AlertDescription>
                    {balanceError}
                </AlertDescription>
            </Alert>
        </div>
     );
  }

  return (
    <div className="h-full w-full overflow-auto">
      <Toaster position="bottom-center" />
      <div className="p-4 space-y-6">
        <div className="flex flex-col space-y-2 mb-2">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Discover Your Investment Opportunities:</h1>
          </div>
          
          {/* Search Bar Section - Featured prominently at the top with visual highlight */}
          <div className="mt-4 mb-6">
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 dark:from-slate-900 dark:to-slate-800 border border-slate-700 rounded-xl p-4 shadow-lg">
              <div className="flex items-center gap-3 mb-3">
                <Search className="text-primary h-5 w-5" />
                <h2 className="text-xl font-semibold text-white">Find Investment Opportunities</h2>
              </div>
              <div className="w-full">
                <StockSearchBar onStockSelect={handleStockSelect} />
              </div>
            </div>
          </div>
          
          {!isLoadingBalance && balanceError && !isLoadingAccountId && (
            <Alert variant="default" className="mb-2 bg-amber-50 border-amber-200 text-amber-800">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Account Information Unavailable</AlertTitle>
                <AlertDescription>
                    We're having trouble connecting to your account data. You can still browse investments, but buying functionality may be limited.
                </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Top Picks Section */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="text-blue-500 h-5 w-5" />
            <h2 className="text-xl font-semibold">Top Picks From Clera's Team</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {topStockPicks.map((stock) => (
              <Card 
                key={stock.symbol}
                className="border hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => handleStockPickClick(stock.symbol)}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col space-y-1">
                    <div className="flex justify-between items-center">
                      <div className="bg-gray-800 dark:bg-gray-700 text-white w-6 h-6 rounded flex items-center justify-center text-xs font-medium">
                        {stock.symbol.charAt(0)}
                      </div>
                      <div className="text-sm font-bold">{stock.symbol}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">YTD Return:</div>
                    <div className={`text-sm font-semibold ${parseFloat(stock.ytdReturn) > 0 ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500'}`}>
                      {stock.ytdReturn}
                    </div>
                    <div className="text-xs text-muted-foreground">Buy Rating:</div>
                    <div className="text-sm font-semibold">{stock.buyRating}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Investment Ideas Section */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="text-yellow-500 h-5 w-5" />
            <h2 className="text-xl font-semibold">Your Personalized Investment Ideas:</h2>
            <span className="text-muted-foreground">Opportunistic tailored to your investment strategy.</span>
          </div>
          <div className={`grid ${isChatOpen ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'} gap-4`}>
            {investmentIdeas.map((idea, index) => (
              <Card 
                key={index}
                className={`border hover:shadow-md transition-shadow cursor-pointer overflow-hidden ${idea.color}`}
              >
                <CardContent className={`p-6 flex flex-col justify-between ${isChatOpen ? 'h-auto min-h-[120px]' : 'h-48'} relative`}>
                  <div className="font-bold text-lg mb-2 relative z-10">{idea.title}</div>
                  {!isChatOpen && (
                    <div className="text-sm text-muted-foreground relative z-10">{idea.description}</div>
                  )}
                  <div className={`absolute inset-0 flex items-center justify-center ${isChatOpen ? 'opacity-10' : 'opacity-15'}`}>
                    {idea.icon}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="pb-24">
          {/* Empty space for bottom padding */}
        </div>
      </div>

      {/* Stock Information Dialog */}
      <Dialog open={!!selectedSymbol} onOpenChange={(open) => !open && setSelectedSymbol(null)}>
        <DialogContent className="sm:max-w-[85vw] lg:max-w-[70vw] xl:max-w-[60vw] p-0 max-h-[90vh] overflow-auto border-0 shadow-xl rounded-lg left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
          <DialogHeader className="bg-slate-950 p-4 flex flex-row items-center justify-between sticky top-0 z-10 border-b border-slate-800">
            <DialogTitle className="text-white text-xl font-semibold">{selectedSymbol}</DialogTitle>
            <DialogClose className="text-white hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-slate-500 rounded-full p-1">
              <X className="h-5 w-5" />
            </DialogClose>
          </DialogHeader>
          <div className="p-0">
            {selectedSymbol && <StockInfoCard symbol={selectedSymbol} />}
          </div>
          
          {/* Action Footer */}
          {selectedSymbol && (
            <div className="sticky bottom-0 left-0 right-0 mt-auto bg-background border-t border-border p-4 flex items-center justify-between shadow-md z-10">
              <div className="text-left">
                <p className="text-xs text-muted-foreground">Available to Invest</p>
                {isLoadingBalance || isLoadingAccountId ? (
                  <Skeleton className="h-6 w-32 mt-1" />
                ) : balanceError ? (
                  <p className="text-sm text-amber-600">Account info unavailable</p>
                ) : (
                  <p className="text-lg font-semibold">{formatCurrency(availableBalance?.cash)}</p>
                )}
              </div>
              <Button 
                size="lg" 
                className="font-semibold text-lg px-6"
                onClick={handleOpenModal}
                disabled={!accountId || isLoadingAccountId || isLoadingBalance || !!balanceError || !availableBalance || availableBalance.cash <= 0}
              >
                $ Invest
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {selectedSymbol && accountId && (
        <BuyOrderModal 
            isOpen={isModalOpen} 
            onClose={handleCloseModal} 
            symbol={selectedSymbol} 
            accountId={accountId} 
        />
      )}
    </div>
  );
} 