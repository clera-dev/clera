"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

interface TransferFormProps {
  alpacaAccountId: string;
  relationshipId: string;
  onTransferComplete?: (amount: string) => void;
  onBack?: () => void;
  bankAccountNumber?: string;
  bankRoutingNumber?: string;
}

export default function TransferForm({ 
  alpacaAccountId, 
  relationshipId,
  onTransferComplete,
  onBack,
  bankAccountNumber = '',
  bankRoutingNumber = ''
}: TransferFormProps) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transferCompleted, setTransferCompleted] = useState(false);
  
  const isValidAmount = () => {
    const numAmount = parseFloat(amount);
    return !isNaN(numAmount) && numAmount >= 1;
  };

  const saveDataToLocalStorage = useCallback((transferId?: string) => {
    try {
      console.log("Saving data to localStorage:", {
        alpacaAccountId, 
        relationshipId, 
        bankAccountNumber: bankAccountNumber ? "Present" : "Missing",
        bankRoutingNumber: bankRoutingNumber ? "Present" : "Missing",
        amount,
        transferId: transferId || "Not provided"
      });
      
      localStorage.setItem('alpacaAccountId', alpacaAccountId);
      localStorage.setItem('relationshipId', relationshipId);
      
      if (bankAccountNumber) {
        localStorage.setItem('bankAccountNumber', bankAccountNumber);
      }
      
      if (bankRoutingNumber) {
        localStorage.setItem('bankRoutingNumber', bankRoutingNumber);
      }
      
      localStorage.setItem('transferAmount', amount);
      
      if (transferId) {
        localStorage.setItem('transferId', transferId);
      }
      
      return true;
    } catch (err) {
      console.error("Error saving to localStorage:", err);
      return false;
    }
  }, [alpacaAccountId, relationshipId, bankAccountNumber, bankRoutingNumber, amount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isValidAmount()) {
      setError("Please enter a valid amount (minimum $1)");
      return;
    }
    
    try {
      setIsTransferring(true);
      setError(null);
      
      // Save basic data first
      saveDataToLocalStorage();
      
      // Always attempt to create a new transfer
      console.log("Initiating new transfer with relationshipId:", relationshipId);
      
      const response = await fetch('/api/broker/transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountId: alpacaAccountId,
          relationshipId: relationshipId,
          amount: amount
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to initiate transfer');
      }
      
      setTransferCompleted(true);
      
      // Save data with the new transfer ID
      saveDataToLocalStorage(data.id);
      
      if (onTransferComplete) {
        console.log("Transfer successful, calling completion callback");
        onTransferComplete(amount);
      } else {
        // Only redirect if we don't have a callback
        console.log("Transfer successful, navigating to dashboard");
        router.replace('/dashboard');
      }
      
    } catch (error) {
      console.error('Error initiating transfer:', error);
      setError(error instanceof Error ? error.message : 'An unknown error occurred');
    } finally {
      setIsTransferring(false);
    }
  };

  // If transfer is completed and we don't have a callback (for dialog-based use),
  // show a success message
  if (transferCompleted && !onTransferComplete) {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="p-4 mb-6 border border-emerald-200 rounded-lg bg-emerald-50">
          <h4 className="font-medium text-emerald-800 mb-1">Transfer initiated!</h4>
          <p className="text-emerald-700 text-sm">
            Your transfer of ${parseFloat(amount).toFixed(2)} has been initiated. 
            Funds may take 1-3 business days to process.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      {onBack && (
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="mb-4 p-2 hover:bg-accent transition-colors text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      )}
      
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold mb-2 text-foreground">Fund Your Account</h2>
        <p className="text-foreground/80 text-base leading-relaxed">
          You have successfully connected your account! To start investing in your future, 
          please enter how much you would like to add to your account.
        </p>
      </div>
      
      {error && (
        <div className="p-4 mb-6 border border-red-200 rounded-lg bg-red-50">
          <p className="text-red-700">{error}</p>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="amount" className="text-foreground font-medium text-base">
            Amount to Transfer (USD)
          </Label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-foreground/70 font-medium">
              $
            </span>
            <Input
              id="amount"
              type="number"
              min="1"
              step="1"
              placeholder="0"
              className="pl-7 bg-card dark:bg-card border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-blue-500 focus-visible:border-blue-500 h-12 text-lg font-medium"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <p className="text-xs text-muted-foreground">Minimum transfer amount: $1.00</p>
        </div>
        
        <Button 
          type="submit" 
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-medium h-12 rounded-lg transition-all duration-200 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed shadow-blue-500/20 shadow-md"
          disabled={isTransferring || !isValidAmount()}
        >
          {isTransferring ? (
            <>
              <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-1" />
              Processing...
            </>
          ) : (
            <>
              Transfer Funds
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </form>
    </div>
  );
} 