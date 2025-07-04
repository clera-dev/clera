"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, AlertTriangle, Check, Info } from "lucide-react";
import TransferForm from "./TransferForm";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

interface ManualBankFormProps {
  alpacaAccountId: string;
  userName: string;
  onTransferComplete?: (amount: string, bankLast4?: string) => void;
  onBack?: () => void;
}

interface ExistingConnection {
  id: string;
  last_4: string;
  bank_account_type: string;
  relationship_id: string;
}

type FormStep = 'checking' | 'existing-found' | 'new-connection' | 'replace-warning' | 'transfer';

export default function ManualBankForm({ 
  alpacaAccountId,
  userName,
  onTransferComplete,
  onBack
}: ManualBankFormProps) {
  const router = useRouter();
  const [formStep, setFormStep] = useState<FormStep>('checking');
  const [existingConnection, setExistingConnection] = useState<ExistingConnection | null>(null);
  const [bankAccountType, setBankAccountType] = useState<"CHECKING" | "SAVINGS">("CHECKING");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankRoutingNumber, setBankRoutingNumber] = useState("121000358");
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [relationshipId, setRelationshipId] = useState<string | null>(null);

  // Check for existing bank connections
  const checkExistingConnections = async () => {
    try {
      setFormStep('checking');

      // Always check Alpaca directly for the most up-to-date status
      // Supabase might have stale data if relationships were cancelled
      const bankStatusResponse = await fetch(`/api/broker/bank-status?accountId=${alpacaAccountId}`);
      
      if (bankStatusResponse.ok) {
        const data = await bankStatusResponse.json();
        
        if (data.relationships && data.relationships.length > 0) {
          // Filter out cancelled or pending cancellation relationships
          const activeRelationship = data.relationships.find(
            (rel: any) => {
              const status = rel.status?.toUpperCase();
              return status === 'APPROVED' || 
                     status === 'ACTIVE' || 
                     status === 'QUEUED' || 
                     status === 'SUBMITTED';
            }
          );
          
          // Log all relationships for debugging
          console.log('[ManualBankForm] Found relationships:', data.relationships.map((rel: any) => ({
            id: rel.id,
            status: rel.status
          })));
          
          if (activeRelationship) {
            console.log('[ManualBankForm] Using active relationship:', activeRelationship.id, 'with status:', activeRelationship.status);
            
            // Get detailed connection info from Supabase since Alpaca doesn't provide last_4
            const supabase = createClient();
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            
            if (userError) {
              console.error('[ManualBankForm] Error getting user:', userError);
            }
            
            if (user) {
              console.log('[ManualBankForm] Querying Supabase for relationship:', activeRelationship.id, 'user:', user.id);
              
              const { data: connections, error: connectionError } = await supabase
                .from('user_bank_connections')
                .select('*')
                .eq('user_id', user.id)
                .eq('relationship_id', activeRelationship.id);
              
              if (connectionError) {
                console.error('[ManualBankForm] Error querying Supabase connections:', connectionError);
              }
              
              console.log('[ManualBankForm] Supabase query result:', connections);
              
              if (connections && connections.length > 0) {
                const connection = connections[0];
                console.log('[ManualBankForm] Found detailed connection info in Supabase:', connection.last_4);
                setExistingConnection({
                  id: connection.id,
                  last_4: connection.last_4,
                  bank_account_type: connection.bank_account_type,
                  relationship_id: activeRelationship.id
                });
              } else {
                console.log('[ManualBankForm] No Supabase record found for relationship, using defaults');
                setExistingConnection({
                  id: activeRelationship.id,
                  last_4: '0000', // Fallback when no Supabase record
                  bank_account_type: 'CHECKING',
                  relationship_id: activeRelationship.id
                });
              }
            } else {
              console.log('[ManualBankForm] No user authentication found, using defaults');
              setExistingConnection({
                id: activeRelationship.id,
                last_4: '0000',
                bank_account_type: 'CHECKING',
                relationship_id: activeRelationship.id
              });
            }
            
            setFormStep('existing-found');
            return;
          } else {
            console.log('[ManualBankForm] No active relationships found - all are cancelled/pending cancellation');
          }
        }
      }
      

      
      // No existing connections found
      setFormStep('new-connection');
      
    } catch (error) {
      console.error('Error checking existing connections:', error);
      setFormStep('new-connection');
    }
  };

  useEffect(() => {
    checkExistingConnections();
  }, [alpacaAccountId]);

  const handleContinueWithExisting = () => {
    if (existingConnection) {
      setRelationshipId(existingConnection.relationship_id);
      setFormStep('transfer');
    }
  };

  const handleChangeAccount = () => {
    setFormStep('replace-warning');
  };

  const handleAddNewAccount = async () => {
    console.log('[ManualBankForm] User confirmed bank replacement - deleting existing ACH relationship');
    
    if (existingConnection) {
      try {
        // Delete the existing ACH relationship BEFORE showing the new connection form
        const deleteResponse = await fetch('/api/broker/delete-ach-relationship', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId: alpacaAccountId,
            achRelationshipId: existingConnection.relationship_id,
          }),
        });

        const deleteResponseData = await deleteResponse.json();
        
        if (!deleteResponse.ok) {
          // Check if the error is because the relationship is already cancelled
          const errorMessage = deleteResponseData.error || JSON.stringify(deleteResponseData);
          
          if (errorMessage.includes('already canceled') || errorMessage.includes('pending cancelation')) {
            console.log('[ManualBankForm] ACH relationship already cancelled - proceeding with new connection');
            // Clear existing connection state and continue
            setExistingConnection(null);
            setFormStep('new-connection');
            return;
          }
          
          console.error('[ManualBankForm] Failed to delete ACH relationship:', errorMessage);
          setConnectionError(errorMessage || 'Failed to delete existing bank connection');
          return;
        }
        
        console.log('[ManualBankForm] Successfully deleted ACH relationship');
        
        // Clear existing connection state
        setExistingConnection(null);
      } catch (error) {
        console.error('[ManualBankForm] Error deleting ACH relationship:', error);
        setConnectionError('Failed to delete existing bank connection');
        return;
      }
    }
    
    setFormStep('new-connection');
  };

  const handleBackToExisting = () => {
    setFormStep('existing-found');
  };

  const isFormValid = () => {
    return (
      bankAccountType &&
      bankAccountNumber.trim().length >= 9 &&
      bankRoutingNumber === "121000358"
    );
  };

  const handleConnectBank = async (e: React.FormEvent) => {
    e.preventDefault();
    
      if (!isFormValid()) {
        setConnectionError("Please fill out all fields correctly. Use routing number 121000358 for testing.");
        return;
      }
      
      if (bankAccountNumber.trim().length < 9) {
        setConnectionError("Bank account number must be at least 9 characters long");
        return;
    }
    
    try {
      setIsConnecting(true);
      setConnectionError(null);
      
      // Note: ACH relationship deletion now happens in handleAddNewAccount when user confirms
      
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
        throw new Error(responseData.error || JSON.stringify(responseData));
      }
      
      // Successfully connected bank
      setRelationshipId(responseData.id);
      setFormStep('transfer');
      
    } catch (error) {
      console.error('Error connecting bank:', error);
      setConnectionError(error instanceof Error ? error.message : 'An unknown error occurred');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleTransferComplete = (amount: string) => {
    if (onTransferComplete) {
      onTransferComplete(amount, existingConnection?.last_4);
    } else {
      router.replace('/dashboard');
    }
  };

  const handleBackFromTransfer = () => {
    // Clear the relationship ID first
    setRelationshipId(null);
    
    // Always re-check for connections since user might have just created one
    checkExistingConnections();
  };

  // Transfer form step
  if (formStep === 'transfer' && relationshipId) {
    return (
      <TransferForm 
        alpacaAccountId={alpacaAccountId}
        relationshipId={relationshipId}
        bankAccountNumber={bankAccountNumber || `****${existingConnection?.last_4 || '0000'}`}
        bankRoutingNumber={bankRoutingNumber}
        onTransferComplete={handleTransferComplete}
        onBack={handleBackFromTransfer}
      />
    );
  }

  // Loading step
  if (formStep === 'checking') {
    return (
      <div className="w-full max-w-md mx-auto text-center">
        <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-foreground/80">Checking your banking information...</p>
      </div>
    );
  }

  // Existing connection found step
  if (formStep === 'existing-found' && existingConnection) {
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
          <div className="w-12 h-12 bg-blue-50 dark:bg-blue-950/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-2xl font-bold mb-2 text-foreground">Bank Account Found</h2>
          <p className="text-foreground/80 text-base leading-relaxed">
            Your account has an existing bank connection.
          </p>
        </div>

        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-blue-800 dark:text-blue-200 font-medium text-sm">
                Connected Bank Account
              </p>
              <p className="text-blue-700 dark:text-blue-300 text-sm mt-1">
                {existingConnection.bank_account_type} account ending in {existingConnection.last_4}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <Button 
            onClick={handleContinueWithExisting}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-medium h-12 rounded-lg transition-all duration-200 hover:shadow-lg shadow-blue-500/20 shadow-md"
          >
            Continue with This Account
          </Button>
          
          <Button 
            onClick={handleChangeAccount}
            variant="outline"
            className="w-full h-12 border-border hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            Change Account
          </Button>
        </div>
      </div>
    );
  }

  // Replace warning step
  if (formStep === 'replace-warning') {
    return (
      <div className="w-full max-w-md mx-auto">
        <Button
          type="button"
          variant="ghost"
          onClick={handleBackToExisting}
          className="mb-4 p-2 hover:bg-accent transition-colors text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-amber-50 dark:bg-amber-950/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="text-2xl font-bold mb-2 text-foreground">Replace Bank Account</h2>
          <p className="text-foreground/80 text-base leading-relaxed">
            Only one bank connection is allowed per account.
          </p>
        </div>

        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-800 dark:text-amber-200 font-medium text-sm">
                Warning
              </p>
              <p className="text-amber-700 dark:text-amber-300 text-sm mt-1">
                By continuing, your existing bank connection will be removed. Then you will be able to connect a new account.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <Button 
            onClick={handleAddNewAccount}
            className="w-full bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-700 hover:to-amber-600 text-white font-medium h-12 rounded-lg transition-all duration-200 hover:shadow-lg shadow-amber-500/20 shadow-md"
          >
            Add New Account
          </Button>
          
          <Button 
            onClick={handleBackToExisting}
            variant="outline"
            className="w-full h-12 border-border hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  // New connection form step
  return (
    <div className="w-full max-w-md mx-auto">
      {(onBack || formStep !== 'new-connection') && (
        <Button
          type="button"
          variant="ghost"
          onClick={onBack || handleBackToExisting}
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
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-red-800 dark:text-red-200 font-medium text-sm mb-1">Connection Error</h4>
            <p className="text-red-700 dark:text-red-300 text-sm">{connectionError}</p>
            </div>
          </div>
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