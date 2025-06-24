'use client';

import { useState, useEffect } from 'react';
import StockSearchBar from '@/components/invest/StockSearchBar';
import StockInfoCard from '@/components/invest/StockInfoCard';
import OrderModal from '@/components/invest/OrderModal';
import InvestmentResearch from '@/components/invest/InvestmentResearch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Toaster } from 'react-hot-toast';
import { formatCurrency, getAlpacaAccountId } from "@/lib/utils";
import { useSidebarCollapse } from "@/components/ClientLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal, Search, AlertCircle, X } from "lucide-react";
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

export default function InvestPage() {
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [availableBalance, setAvailableBalance] = useState<BalanceData | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isLoadingAccountId, setIsLoadingAccountId] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);
  
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
    // Auto-collapse sidebar when stock dialog opens
    autoCollapseSidebar();
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
          },
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

        {/* Investment Research Component - Replaces static content */}
        <InvestmentResearch 
          onStockSelect={handleStockSelect}
          isChatOpen={isChatOpen}
          onThemeSelect={autoCollapseSidebar}
        />

        <div className="pb-24">
          {/* Empty space for bottom padding */}
        </div>
      </div>

      {/* Stock Information Dialog */}
      <Dialog open={!!selectedSymbol} onOpenChange={(open) => !open && setSelectedSymbol(null)}>
        <DialogContent className="sm:max-w-[85vw] lg:max-w-[70vw] xl:max-w-[60vw] p-0 max-h-[90vh] overflow-auto border-0 shadow-xl rounded-lg left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-[100]">
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
        <OrderModal 
            isOpen={isModalOpen} 
            onClose={handleCloseModal} 
            symbol={selectedSymbol} 
            accountId={accountId}
            orderType="BUY"
        />
      )}
    </div>
  );
} 