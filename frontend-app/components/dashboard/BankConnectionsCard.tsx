"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlusCircle, Wallet, ExternalLink } from "lucide-react";
import ManualBankForm from "@/components/funding/ManualBankForm";
import TransferForm from "@/components/funding/TransferForm";
import { useRouter } from "next/navigation";

interface BankAccount {
  id: string;
  status: string;
  accountId: string;
  createdAt: string;
  bankName?: string;
  nickname?: string;
  last4?: string;
}

interface BankConnectionsCardProps {
  alpacaAccountId?: string;
  email?: string;
  userName?: string;
}

export default function BankConnectionsCard({
  alpacaAccountId,
  email,
  userName = 'User'
}: BankConnectionsCardProps) {
  const router = useRouter();
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [view, setView] = useState<'banks' | 'addBank' | 'transfer'>('banks');
  const [selectedBankId, setSelectedBankId] = useState<string | null>(null);
  const [transferCompleted, setTransferCompleted] = useState(false);

  // Check for URL parameter to auto-open dialog
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('openAddFunds') === 'true') {
      setIsDialogOpen(true);
      // Clean up URL parameter
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }
  }, []);

  const fetchBankAccounts = async () => {
    if (!alpacaAccountId) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/broker/bank-status?accountId=${alpacaAccountId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        console.warn(`Bank status API returned ${response.status}: ${response.statusText}`);
        throw new Error("Failed to fetch bank accounts");
      }

      const data = await response.json();
      console.log("Bank relationships response:", data);
      
      if (data.relationships && Array.isArray(data.relationships)) {
        setBankAccounts(data.relationships.map((rel: any) => ({
          id: rel.id,
          status: rel.status,
          accountId: rel.account_id,
          createdAt: rel.created_at,
          bankName: rel.bank_name || "Bank Account",
          nickname: rel.nickname,
          last4: rel.bank_account_last4
        })));
      }
    } catch (error) {
      console.error("Error fetching bank accounts:", error);
      setError("Could not load bank accounts");
      // Set empty array rather than leaving undefined
      setBankAccounts([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isDialogOpen) {
      fetchBankAccounts();
    }
  }, [alpacaAccountId, isDialogOpen]);

  const handleOpenDialog = () => {
    setIsDialogOpen(true);
    setView('banks');
    setSelectedBankId(null);
    setTransferCompleted(false);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    // Reset back to banks view for next open
    setView('banks');
  };

  const handleAddBank = () => {
    // Show a warning if there's already a bank connected
    if (bankAccounts.length > 0) {
      if (window.confirm(
        "IMPORTANT: Alpaca only allows one active bank connection at a time.\n\n" +
        "If you continue, you will: \n" +
        "1. Need to enter new bank details\n" + 
        "2. Delete your existing connection ONLY after confirming\n" +
        "3. Create a new connection with your new bank details\n\n" +
        "Your existing bank connection will remain until you complete the form and submit.\n\n" +
        "Continue to replace your bank account?"
      )) {
        setView('addBank');
      }
    } else {
      setView('addBank');
    }
  };

  const handleBankClick = (bankId: string) => {
    setSelectedBankId(bankId);
    localStorage.setItem('relationshipId', bankId);
    setView('transfer');
  };

  const handleTransferComplete = (amount: string) => {
    setTransferCompleted(true);
    
    try {
      localStorage.setItem('transferAmount', amount);
    } catch (e) {
      console.error("Error saving transfer amount to localStorage:", e);
    }
    
    // Add delay to show success message before closing
    setTimeout(() => {
      handleCloseDialog();
      router.refresh();
    }, 2000);
  };

  const handleBankAdded = () => {
    // After a bank is added, go back to the list of banks
    fetchBankAccounts();
    setView('banks');
  };

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <Button 
          onClick={handleOpenDialog}
          className="w-full flex gap-2 items-center justify-center bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white border-0 hover:shadow-lg transition-all duration-200 font-medium h-12 rounded-lg shadow-blue-500/20 shadow-md"
        >
          <PlusCircle className="h-4 w-4" />
          Add Funds
        </Button>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-md bg-card text-foreground border-border shadow-xl z-50">
            <DialogHeader className="pb-2 border-b border-border">
              <DialogTitle className="text-xl text-foreground">
                {view === 'banks' ? 'Add Funds' : 
                 view === 'addBank' ? 'Add a Bank Account' : 'Transfer Funds'}
              </DialogTitle>
            </DialogHeader>

            {error && view === 'banks' && (
              <div className="p-4 my-2 border border-red-300 rounded-lg bg-red-50">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            {transferCompleted ? (
              <div className="py-8 text-center">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-emerald-100 mb-4">
                  <svg className="h-6 w-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">Transfer Initiated!</h3>
                <p className="text-foreground/80">Your funds will be processed in 1-3 business days.</p>
              </div>
            ) : isLoading && view === 'banks' ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
              </div>
            ) : view === 'banks' ? (
              <div className="pt-2">
                <div className="space-y-4">
                  {bankAccounts.length > 0 && (
                  <>
                      <h3 className="text-foreground font-medium">Fund from Connected Bank</h3>
                      {bankAccounts.map((bank) => (
                      <div 
                          key={bank.id}
                          className="cursor-pointer rounded-lg border border-border transition-all duration-200 hover:border-blue-300 hover:shadow-md bg-card" 
                          onClick={() => handleBankClick(bank.id)}
                      >
                        <div className="p-4 flex items-center gap-4">
                            <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-full">
                              <Wallet className="h-6 w-6 text-blue-600" />
                          </div>
                          <div>
                              <h3 className="font-medium text-foreground text-lg">
                                {bank.bankName || "Bank Account"}
                                {bank.last4 && (
                                  <span className="ml-2 text-muted-foreground">•••• {bank.last4}</span>
                              )}
                            </h3>
                              <p className="text-sm text-muted-foreground">
                                Connected on {new Date(bank.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                      <div className="my-4 border-t border-border"></div>
                    </>
                )}

                  <div 
                    className="cursor-pointer rounded-lg border border-border transition-all duration-200 hover:border-blue-300 hover:shadow-md bg-muted/50" 
                    onClick={handleAddBank}
                  >
                    <div className="p-4 flex items-center gap-4">
                      <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-full">
                        <PlusCircle className="h-6 w-6 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-medium text-foreground text-lg">
                          {bankAccounts.length > 0 ? "Replace bank account" : "Enter bank account details"}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {bankAccounts.length > 0 
                            ? "Replace your existing bank connection with a new one" 
                            : "Add a new bank account to fund your investments"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : view === 'addBank' ? (
              <div className="pt-2">
                <ManualBankForm
                  alpacaAccountId={alpacaAccountId || ''}
                  userName={userName}
                  onTransferComplete={handleBankAdded}
                  onBack={() => setView('banks')}
                />
              </div>
            ) : view === 'transfer' && selectedBankId ? (
              <TransferForm
                alpacaAccountId={alpacaAccountId || ''}
                relationshipId={selectedBankId}
                onTransferComplete={handleTransferComplete}
                onBack={() => setView('banks')}
              />
            ) : null}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
} 