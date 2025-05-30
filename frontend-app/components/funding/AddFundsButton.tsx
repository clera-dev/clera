"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import ManualBankForm from "./ManualBankForm";
import TransferForm from "./TransferForm";
import { PlusCircle, Wallet, ExternalLink } from "lucide-react";

interface AddFundsButtonProps {
  alpacaAccountId: string;
  relationshipId?: string;
  bankLast4?: string;
  userName: string;
}

export default function AddFundsButton({
  alpacaAccountId,
  relationshipId,
  bankLast4,
  userName
}: AddFundsButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedOption, setSelectedOption] = useState<'existing' | 'new' | null>(null);
  const [transferCompleted, setTransferCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load connected bank accounts
  useEffect(() => {
    if (isOpen && alpacaAccountId) {
      fetchBankAccounts();
    }
  }, [isOpen, alpacaAccountId]);

  const fetchBankAccounts = async () => {
    if (!alpacaAccountId) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/broker/bank-status?accountId=${alpacaAccountId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error("Failed to fetch bank accounts");
      }

      const data = await response.json();
      
      if (data.relationships && Array.isArray(data.relationships)) {
        // Filter for active relationships
        const activeAccounts = data.relationships.filter(
          (rel: any) => rel.status === 'APPROVED' || rel.status === 'ACTIVE'
        );
        setBankAccounts(activeAccounts);
      }
    } catch (error) {
      console.error("Error fetching bank accounts:", error);
      setError("Could not load connected banks. You can still add a new bank account.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenDialog = () => {
    setIsOpen(true);
    setSelectedOption(null);
    setTransferCompleted(false);
    setError(null);
  };

  const handleCloseDialog = () => {
    setIsOpen(false);
    setSelectedOption(null);
  };

  const handleSelectBank = (bankId: string) => {
    // Store data in localStorage for the transfer page
    try {
      localStorage.setItem('alpacaAccountId', alpacaAccountId);
      localStorage.setItem('relationshipId', bankId);
    } catch (e) {
      console.error("Error saving to localStorage:", e);
    }
    
    // Show the transfer form
    setSelectedOption('existing');
    setError(null);
  };

  const handleNewBank = () => {
    setSelectedOption('new');
    setError(null);
  };

  const handleTransferComplete = (amount: string) => {
    setTransferCompleted(true);
    
    // Store the amount in localStorage
    try {
      localStorage.setItem('transferAmount', amount);
    } catch (e) {
      console.error("Error saving transfer amount to localStorage:", e);
    }
    
    // Add delay to show success message before closing
    setTimeout(() => {
      handleCloseDialog();
      // Refresh the page to update any bank or transfer info
      router.refresh();
    }, 2000);
  };

  return (
    <>
      <Button 
        onClick={handleOpenDialog}
        className="w-full flex gap-2 items-center justify-center mt-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white border-0 hover:shadow-lg transition-all duration-200 font-medium h-12 rounded-lg shadow-blue-500/20 shadow-md"
      >
        <PlusCircle className="h-4 w-4" />
        Add Funds
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md bg-card border-border shadow-xl z-50">
          <DialogHeader>
            <DialogTitle className="text-foreground text-xl font-semibold">Fund Your Account</DialogTitle>
          </DialogHeader>

          {error && (
            <div className="p-4 mb-4 border border-red-200 rounded-lg bg-red-50">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
            </div>
          ) : transferCompleted ? (
            <div className="py-8 text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-emerald-100 mb-4">
                <svg className="h-6 w-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">Transfer Initiated!</h3>
              <p className="text-foreground/80">Your funds will be processed in 1-3 business days.</p>
            </div>
          ) : selectedOption === null ? (
            <div className="grid gap-4 py-4">
              {/* Connected Bank Accounts Section */}
              {bankAccounts.length > 0 ? (
                <>
                  <h3 className="text-foreground font-medium">Fund from Connected Bank</h3>
                  {bankAccounts.map((account) => (
                    <Card 
                      key={account.id}
                      className="cursor-pointer border border-border transition-all duration-200 hover:border-blue-300 hover:shadow-md" 
                      onClick={() => handleSelectBank(account.id)}
                    >
                      <CardContent className="p-4 flex items-center gap-3 hover:bg-accent transition-colors duration-200">
                        <Wallet className="h-5 w-5 text-blue-600" />
                        <div>
                          <h3 className="font-medium text-foreground">
                            {account.bank_name || "Bank Account"}
                            {account.bank_account_last4 && (
                              <span className="ml-2 text-muted-foreground">
                                •••• {account.bank_account_last4}
                              </span>
                            )}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Connected on {new Date(account.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </>
              ) : (
                <p className="text-sm text-foreground/80 mb-2">
                  No connected bank accounts found. Please add a new bank account to fund your account.
                </p>
              )}

              {/* Add New Bank Option */}
              <div className="mt-2">
                <h3 className="text-foreground font-medium mb-2">Or Add a New Bank Account</h3>
                <Card 
                  className="cursor-pointer border border-border transition-all duration-200 hover:border-blue-300 hover:shadow-md" 
                  onClick={handleNewBank}
                >
                  <CardContent className="p-4 flex items-center gap-3 hover:bg-accent transition-colors duration-200">
                    <PlusCircle className="h-5 w-5 text-blue-600" />
                    <div>
                      <h3 className="font-medium text-foreground">Enter new bank account information</h3>
                      <p className="text-sm text-muted-foreground">
                        Add a new bank account to fund your investments
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : selectedOption === 'existing' ? (
            <TransferForm
              alpacaAccountId={alpacaAccountId}
              relationshipId={localStorage.getItem('relationshipId') || ''}
              onTransferComplete={handleTransferComplete}
              onBack={() => setSelectedOption(null)}
            />
          ) : selectedOption === 'new' ? (
            <ManualBankForm
              alpacaAccountId={alpacaAccountId}
              userName={userName}
              onTransferComplete={() => {
                setTransferCompleted(true);
                // Add delay to show success message before closing
                setTimeout(() => {
                  handleCloseDialog();
                  // Refresh the page to update any bank or transfer info
                  router.refresh();
                }, 2000);
              }}
              onBack={() => setSelectedOption(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
} 