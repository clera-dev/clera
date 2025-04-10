'use client';

import { useState, useEffect } from 'react';
import StockSearchBar from '@/components/invest/StockSearchBar';
import StockInfoCard from '@/components/invest/StockInfoCard';
import BuyOrderModal from '@/components/invest/BuyOrderModal';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Toaster } from 'react-hot-toast';
import { formatCurrency } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

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

  useEffect(() => {
    const storedAccountId = localStorage.getItem('alpacaAccountId');
    if (storedAccountId) {
        setAccountId(storedAccountId);
    } else {
        console.warn("Alpaca Account ID not found in localStorage. Cannot fetch balance or place trades.");
        setBalanceError("Alpaca account ID not found. Please complete onboarding.")
    }
  }, []);

  useEffect(() => {
    if (!accountId) return;

    const fetchBalance = async () => {
        setIsLoadingBalance(true);
        setBalanceError(null);
        try {
            const response = await fetch(`/api/account/${accountId}/balance`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || `Failed to fetch balance: ${response.statusText}`);
            }
            const result = await response.json();
            if (result.success) {
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

  }, [accountId]);

  const handleStockSelect = (symbol: string) => {
    setSelectedSymbol(symbol);
  };

  const handleOpenModal = () => {
    if (selectedSymbol && accountId) {
      setIsModalOpen(true);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  return (
    <div className="relative h-full">
      <Toaster position="bottom-center" />
      <ScrollArea className="h-[calc(100%-80px)]">
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
          <div className="flex items-center justify-between space-y-2">
            <h2 className="text-3xl font-bold tracking-tight">Invest</h2>
          </div>
          
          <div className="mb-6">
            <StockSearchBar onStockSelect={handleStockSelect} />
          </div>

          <div className="mt-6 pb-20">
            {selectedSymbol ? (
              <StockInfoCard symbol={selectedSymbol} />
            ) : (
              <div className="text-center text-muted-foreground py-10">
                Search for a stock symbol above to see details.
              </div>
            )}
          </div>

        </div>
      </ScrollArea>

      {selectedSymbol && (
        <div className="fixed bottom-0 left-0 lg:left-64 right-0 h-20 bg-background border-t border-border p-4 flex items-center justify-between shadow-md z-10">
          <div className="text-left">
             <p className="text-xs text-muted-foreground">Available to Invest</p>
             {isLoadingBalance ? (
                 <Skeleton className="h-6 w-32 mt-1" />
             ) : balanceError ? (
                 <p className="text-sm font-semibold text-destructive">Error</p>
             ) : (
                 <p className="text-lg font-semibold">{formatCurrency(availableBalance?.cash)}</p>
             )}
          </div>
          <Button 
            size="lg" 
            className="font-semibold text-lg px-6"
            onClick={handleOpenModal}
            disabled={!accountId || isLoadingBalance || !!balanceError}
           >
             $ Invest
           </Button>
        </div>
      )}

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