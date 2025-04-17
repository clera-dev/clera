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
import { Terminal } from "lucide-react";

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
                throw new Error(errorData.detail || `Failed to fetch balance: ${response.statusText}`);
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
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>
                    {balanceError}
                </AlertDescription>
            </Alert>
        </div>
     );
  }

  return (
    <div className="relative h-full">
      <Toaster position="bottom-center" />
      <ScrollArea className="h-[calc(100%-80px)]">
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
          <div className="flex items-center justify-between space-y-2">
            <h2 className="text-3xl font-bold tracking-tight">Invest</h2>
          </div>
          
          {!isLoadingBalance && balanceError && !isLoadingAccountId && (
            <Alert variant="destructive" className="mb-4">
                <Terminal className="h-4 w-4" />
                <AlertTitle>Balance Error</AlertTitle>
                <AlertDescription>
                    {balanceError}
                </AlertDescription>
            </Alert>
          )}

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
             {isLoadingBalance || isLoadingAccountId ? (
                 <Skeleton className="h-6 w-32 mt-1" />
             ) : balanceError ? (
                 <p className="text-sm font-semibold text-destructive">Error Loading</p>
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