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
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Connected Banks</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button 
          onClick={handleOpenDialog}
          className="w-full flex gap-2 items-center justify-center bg-white text-black border border-gray-300 hover:bg-gray-50"
        >
          <PlusCircle className="h-4 w-4" />
          Add Funds
        </Button>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-md bg-white text-black">
            <DialogHeader className="pb-2 border-b border-gray-300">
              <DialogTitle className="text-xl text-black">
                {view === 'banks' ? 'Add Funds' : 
                 view === 'addBank' ? 'Add a Bank Account' : 'Transfer Funds'}
              </DialogTitle>
            </DialogHeader>

            {error && view === 'banks' && (
              <div className="p-4 my-2 border border-red-300 rounded-lg bg-red-50">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            {isLoading && view === 'banks' ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : view === 'banks' ? (
              <div className="grid gap-5 py-5">
                {/* Connected Bank Accounts Section */}
                {bankAccounts.length > 0 ? (
                  <>
                    <h3 className="text-black font-medium text-lg">Select a bank to transfer funds from</h3>
                    {bankAccounts.map((account) => (
                      <div 
                        key={account.id}
                        className="cursor-pointer rounded-lg border border-gray-300 transition-colors shadow-sm hover:shadow hover:border-primary bg-gray-50" 
                        onClick={() => handleBankClick(account.id)}
                      >
                        <div className="p-4 flex items-center gap-4">
                          <div className="bg-primary/20 p-3 rounded-full">
                            <Wallet className="h-6 w-6 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-medium text-black text-lg">
                              {account.bankName || account.nickname || "Bank Account"}
                              {account.last4 && (
                                <span className="ml-2 text-gray-600">
                                  •••• {account.last4}
                                </span>
                              )}
                            </h3>
                            <p className="text-sm text-gray-600">
                              Connected on {new Date(account.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-300">
                    <p className="text-blue-800">
                      No connected bank accounts found. Please add a new bank account to fund your account.
                    </p>
                  </div>
                )}

                {/* Add New Bank Option */}
                <div className="mt-4 pt-4 border-t border-gray-300">
                  <h3 className="text-black font-medium mb-3 text-lg">
                    {bankAccounts.length > 0 ? "Replace existing bank account" : "Add a bank account"}
                  </h3>
                  {bankAccounts.length > 0 && (
                    <div className="mb-4 p-3 bg-yellow-50 border border-yellow-300 rounded-lg">
                      <p className="text-yellow-800 text-sm">
                        Note: Alpaca only allows one active bank connection. Adding a new bank will replace your current connection.
                      </p>
                    </div>
                  )}
                  <div 
                    className="cursor-pointer rounded-lg border border-gray-300 transition-colors shadow-sm hover:shadow hover:border-primary bg-gray-50" 
                    onClick={handleAddBank}
                  >
                    <div className="p-4 flex items-center gap-4">
                      <div className="bg-primary/20 p-3 rounded-full">
                        <PlusCircle className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium text-black text-lg">
                          {bankAccounts.length > 0 ? "Replace bank account" : "Enter bank account details"}
                        </h3>
                        <p className="text-sm text-gray-600">
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
                />
              </div>
            ) : view === 'transfer' && selectedBankId ? (
              <TransferForm
                alpacaAccountId={alpacaAccountId || ''}
                relationshipId={selectedBankId}
                onTransferComplete={handleTransferComplete}
              />
            ) : null}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
} 