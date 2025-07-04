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
      
      // Always show the success page - don't auto-redirect anymore
      console.log("Transfer successful, showing success page");
      
      // Still call the callback if provided (for any parent component logic)
      if (onTransferComplete) {
        onTransferComplete(amount);
      }
      
    } catch (error) {
      console.error('Error initiating transfer:', error);
      
      // Handle specific error cases for better user experience
      let errorMessage = 'An unknown error occurred';
      
      if (error instanceof Error) {
        const message = error.message;
        
        // Parse JSON error messages from API
        try {
          const parsedError = JSON.parse(message);
          if (parsedError.code === 42210000 || parsedError.message?.includes('maximum number of ACH transfers')) {
            errorMessage = "You've reached the daily transfer limit. You can only make one ACH transfer per trading day in each direction. Please try again tomorrow.";
          } else if (parsedError.message) {
            errorMessage = parsedError.message;
          }
        } catch (e) {
          // Not a JSON error, use the raw message
          if (message.includes('maximum number of ACH transfers') || message.includes('42210000')) {
            errorMessage = "You've reached the daily transfer limit. You can only make one ACH transfer per trading day in each direction. Please try again tomorrow.";
          } else if (message.includes('insufficient funds')) {
            errorMessage = "Insufficient funds in your bank account. Please check your account balance and try again.";
          } else if (message.includes('invalid account')) {
            errorMessage = "There was an issue with your bank account. Please verify your account details.";
          } else {
            errorMessage = message;
          }
        }
      }
      
      setError(errorMessage);
    } finally {
      setIsTransferring(false);
    }
  };

  // If transfer is completed, show the beautiful success page
  if (transferCompleted) {
    return (
      <div className="w-full max-w-md mx-auto text-center">
        {/* Success Icon */}
        <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-950/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        {/* Success Message */}
        <h2 className="text-3xl font-bold text-foreground mb-4">
          Congratulations! 🎉
        </h2>
        
        <p className="text-xl text-foreground mb-2">
          You have successfully funded your account
        </p>
        
        <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-center gap-2 mb-3">
            <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
            </svg>
            <span className="text-emerald-800 dark:text-emerald-200 font-semibold">
              Transfer Amount: ${parseFloat(amount).toFixed(2)}
            </span>
          </div>
          <p className="text-emerald-700 dark:text-emerald-300 text-sm">
            Your funds are being processed and will be available in your account within 1-3 business days.
          </p>
        </div>

        <p className="text-foreground/80 text-lg leading-relaxed mb-8">
          Head to the invest page below to start trading with Clera
        </p>

        {/* Action Buttons */}
        <div className="space-y-3">
          <Button 
            onClick={() => router.push('/invest')}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-medium h-12 rounded-lg transition-all duration-200 hover:shadow-lg shadow-blue-500/20 shadow-md"
          >
            <ArrowRight className="h-4 w-4 mr-2" />
            Start Investing
          </Button>
          
          <Button 
            onClick={() => router.push('/dashboard')}
            variant="outline"
            className="w-full h-12 border-border hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            View Dashboard
          </Button>
        </div>

        {/* Additional Info */}
        <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-blue-800 dark:text-blue-200 text-sm">
            💡 <strong>Next Steps:</strong> While your funds are processing, you can explore our research tools, 
            set up watchlists, and learn about investment strategies.
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
        <p className="text-foreground/80 text-base leading-relaxed mb-4">
          You have successfully connected your account! This is the final step.
        </p>
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <p className="text-blue-800 dark:text-blue-200 font-medium">
            Fund your account with as little as $1 to start your investing journey with Clera
          </p>
        </div>
      </div>
      
      {error && (
        <div className="p-4 mb-6 border border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-950/20">
          <div className="flex items-start gap-3">
            <svg className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <h4 className="text-red-800 dark:text-red-200 font-medium text-sm mb-1">Transfer Error</h4>
              <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
            </div>
          </div>
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