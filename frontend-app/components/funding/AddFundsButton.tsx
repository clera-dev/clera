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
        className="w-full flex gap-2 items-center justify-center mt-4 bg-white text-black border border-gray-200 hover:bg-gray-100 hover:text-black"
      >
        <PlusCircle className="h-4 w-4" />
        Add Funds
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>Fund Your Account</DialogTitle>
          </DialogHeader>

          {error && (
            <div className="p-4 mb-4 border border-red-200 rounded-lg bg-red-50">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : selectedOption === null ? (
            <div className="grid gap-4 py-4">
              {/* Connected Bank Accounts Section */}
              {bankAccounts.length > 0 ? (
                <>
                  <h3 className="text-black font-medium">Fund from Connected Bank</h3>
                  {bankAccounts.map((account) => (
                    <Card 
                      key={account.id}
                      className="cursor-pointer border border-gray-200 transition-colors" 
                      onClick={() => handleSelectBank(account.id)}
                    >
                      <CardContent className="p-4 flex items-center gap-3 hover:bg-gray-50">
                        <Wallet className="h-5 w-5 text-primary" />
                        <div>
                          <h3 className="font-medium text-black">
                            {account.bank_name || "Bank Account"}
                            {account.bank_account_last4 && (
                              <span className="ml-2 text-gray-600">
                                •••• {account.bank_account_last4}
                              </span>
                            )}
                          </h3>
                          <p className="text-sm text-gray-600">
                            Connected on {new Date(account.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </>
              ) : (
                <p className="text-sm text-gray-600 mb-2">
                  No connected bank accounts found. Please add a new bank account to fund your account.
                </p>
              )}

              {/* Add New Bank Option */}
              <div className="mt-2">
                <h3 className="text-black font-medium mb-2">Or Add a New Bank Account</h3>
                <Card 
                  className="cursor-pointer border border-gray-200 transition-colors" 
                  onClick={handleNewBank}
                >
                  <CardContent className="p-4 flex items-center gap-3 hover:bg-gray-50">
                    <PlusCircle className="h-5 w-5 text-primary" />
                    <div>
                      <h3 className="font-medium text-black">Enter new bank account information</h3>
                      <p className="text-sm text-gray-600">
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
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
} 