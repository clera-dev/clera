"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import TransferForm from "./TransferForm";
import { useRouter } from "next/navigation";

interface ManualBankFormProps {
  alpacaAccountId: string;
  userName: string;
  onTransferComplete?: () => void; // Add callback for dialog usage
  onBack?: () => void; // Add back button handler
}

export default function ManualBankForm({ 
  alpacaAccountId,
  userName,
  onTransferComplete,
  onBack // Add back handler
}: ManualBankFormProps) {
  const router = useRouter();
  const [bankAccountType, setBankAccountType] = useState<"CHECKING" | "SAVINGS">("CHECKING");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankRoutingNumber, setBankRoutingNumber] = useState("121000358"); // Valid test routing number for Alpaca
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [bankConnected, setBankConnected] = useState(false);
  const [relationshipId, setRelationshipId] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  // Add container ref for Select portal
  const selectContainerRef = useRef<HTMLDivElement>(null);

  // Check if user already has an ACH relationship
  const checkExistingRelationship = async () => {
    try {
      setIsChecking(true);
      
      const response = await fetch(`/api/broker/bank-status?accountId=${alpacaAccountId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.relationships && data.relationships.length > 0) {
          const activeRelationship = data.relationships.find(
            (rel: any) => rel.status === 'APPROVED' || rel.status === 'ACTIVE'
          );
          
          if (activeRelationship) {
            console.log("Found active relationship:", activeRelationship.id);
            
            // Store data in localStorage
            localStorage.setItem('alpacaAccountId', alpacaAccountId);
            localStorage.setItem('relationshipId', activeRelationship.id);
            localStorage.setItem('bankAccountNumber', `xxxx-xxxx-${activeRelationship.bank_account_last4 || '0000'}`);
            localStorage.setItem('bankRoutingNumber', "121000358");
            
            // If we're in a dialog, use the relationship directly
            if (onTransferComplete) {
              setBankConnected(true);
              setRelationshipId(activeRelationship.id);
              return true;
            } else {
              // Otherwise redirect to dashboard
              router.replace('/dashboard');
              return true;
            }
          }
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error checking bank status:', error);
      return false;
    } finally {
      setIsChecking(false);
    }
  };

  // Call the check on component mount
  useEffect(() => {
    checkExistingRelationship();
  }, [alpacaAccountId, onTransferComplete]);

  const isFormValid = () => {
    return (
      bankAccountType &&
      bankAccountNumber.trim().length >= 9 &&
      bankRoutingNumber === "121000358" // Only allow the valid test routing number
    );
  };

  const handleConnectBank = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Skip validation for existing relationships
    if (!bankConnected) {
      // Validate form fields
      if (!isFormValid()) {
        setConnectionError("Please fill out all fields correctly. Use routing number 121000358 for testing.");
        return;
      }
      
      if (bankAccountNumber.trim().length < 9) {
        setConnectionError("Bank account number must be at least 9 characters long");
        return;
      }
    }
    
    try {
      setIsConnecting(true);
      setConnectionError(null);
      
      const response = await fetch('/api/broker/connect-bank-manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountId: alpacaAccountId,
          accountOwnerName: userName || "Account Owner",
          bankAccountType,
          bankAccountNumber: bankAccountNumber.trim(),
          bankRoutingNumber: bankRoutingNumber.trim(),
        }),
      });
      
      const responseData = await response.json();
      
      if (!response.ok) {
        if (responseData.message && responseData.message.includes("Using existing ACH relationship")) {
          // If we're using an existing relationship
          console.log("Using existing relationship:", responseData.id);
          
          localStorage.setItem('alpacaAccountId', alpacaAccountId);
          localStorage.setItem('relationshipId', responseData.id);
          localStorage.setItem('bankAccountNumber', bankAccountNumber);
          localStorage.setItem('bankRoutingNumber', bankRoutingNumber);
          
          // When in dialog mode with onTransferComplete callback, don't show transfer form
          // but notify the parent we've finished adding the bank
          if (onTransferComplete) {
            console.log("Notifying parent that bank connection is complete");
            onTransferComplete();
            return;
          } else {
            // Otherwise redirect to dashboard
            router.replace('/dashboard');
            return;
          }
        }
        
        throw new Error(responseData.error || JSON.stringify(responseData));
      }
      
      // If successful, update the state
      console.log("Bank connected successfully with relationshipId:", responseData.id);
      localStorage.setItem('alpacaAccountId', alpacaAccountId);
      localStorage.setItem('relationshipId', responseData.id);
      
      // When in dialog mode with onTransferComplete callback, don't show transfer form
      // but notify the parent we've finished adding the bank
      if (onTransferComplete) {
        console.log("Notifying parent that bank connection is complete");
        onTransferComplete();
        return;
      }
      
      // Only set these states if we're not using the callback
      setBankConnected(true);
      setRelationshipId(responseData.id);
      
    } catch (error) {
      console.error('Error connecting bank:', error);
      setConnectionError(error instanceof Error ? error.message : 'An unknown error occurred');
    } finally {
      setIsConnecting(false);
    }
  };

  // Handle transfer completion
  const handleTransferComplete = (amount: string) => {
    if (onTransferComplete) {
      onTransferComplete();
    } else {
      router.replace('/dashboard');
    }
  };

  // Handle back from transfer form
  const handleBackFromTransfer = () => {
    setBankConnected(false);
    setRelationshipId(null);
  };

  // Only show transfer form when not in dialog mode 
  // (when onTransferComplete is not provided)
  if (bankConnected && relationshipId && !onTransferComplete) {
    return (
      <TransferForm 
        alpacaAccountId={alpacaAccountId}
        relationshipId={relationshipId}
        bankAccountNumber={bankAccountNumber}
        bankRoutingNumber={bankRoutingNumber}
        onTransferComplete={handleTransferComplete}
        onBack={handleBackFromTransfer}
      />
    );
  }

  if (isChecking) {
    return (
      <div className="w-full max-w-md mx-auto text-center">
        <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-foreground/80">Checking your banking information...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Add back button */}
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
        <h2 className="text-2xl font-bold mb-2 text-foreground">Connect Your Bank Account</h2>
        <p className="text-foreground/80 text-base leading-relaxed">
          Enter your bank account details to fund your investment account.
        </p>
      </div>
      
      {connectionError && (
        <div className="p-4 mb-6 border border-red-200 rounded-lg bg-red-50">
          <p className="text-red-700">{connectionError}</p>
        </div>
      )}
      
      <form onSubmit={handleConnectBank} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="bankAccountType" className="text-foreground font-medium text-base">
            Bank Account Type
          </Label>
          <Select 
            value={bankAccountType} 
            onValueChange={(value: "CHECKING" | "SAVINGS") => setBankAccountType(value)}
          >
            <SelectTrigger className="bg-card border-border text-foreground h-12 focus:ring-blue-500 focus:border-blue-500">
              <SelectValue placeholder="Select account type" />
            </SelectTrigger>
            <SelectContent className="z-[100] bg-popover border-border shadow-xl">
              <SelectItem value="CHECKING" className="text-foreground hover:bg-accent focus:bg-accent cursor-pointer">
                Checking
              </SelectItem>
              <SelectItem value="SAVINGS" className="text-foreground hover:bg-accent focus:bg-accent cursor-pointer">
                Savings
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="bankAccountNumber" className="text-foreground font-medium text-base">
            Bank Account Number
          </Label>
          <Input
            id="bankAccountNumber"
            type="text"
            placeholder="Enter account number"
            className="bg-card border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-blue-500 focus-visible:border-blue-500 h-12"
            value={bankAccountNumber}
            onChange={(e) => setBankAccountNumber(e.target.value)}
            required
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="bankRoutingNumber" className="text-foreground font-medium text-base">
            Bank Routing Number
          </Label>
          <Input
            id="bankRoutingNumber"
            type="text"
            inputMode="numeric"
            className="bg-muted border-border text-muted-foreground h-12"
            value={bankRoutingNumber}
            onChange={(e) => setBankRoutingNumber(e.target.value)}
            required
            disabled
          />
          <p className="text-xs text-muted-foreground">Using test routing number 121000358 for Alpaca sandbox</p>
        </div>
        
        <Button 
          type="submit" 
          className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-medium h-12 rounded-lg transition-all duration-200 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed shadow-blue-500/20 shadow-md"
          disabled={isConnecting || !isFormValid()}
        >
          {isConnecting ? (
            <>
              <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-2" />
              Connecting...
            </>
          ) : (
            "Connect Bank"
          )}
        </Button>
      </form>
    </div>
  );
} 