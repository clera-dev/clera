"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlusCircle } from "lucide-react";
import ManualBankForm from "@/components/funding/ManualBankForm";
import TransferSuccessDialog from "@/components/funding/TransferSuccessDialog";
import { useRouter } from "next/navigation";

interface BankConnectionsCardProps {
  alpacaAccountId?: string;
  email?: string;
  userName?: string;
}

export default function BankConnectionsCard({
  alpacaAccountId,
  userName = 'User'
}: BankConnectionsCardProps) {
  const router = useRouter();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSuccessDialogOpen, setIsSuccessDialogOpen] = useState(false);
  const [transferAmount, setTransferAmount] = useState<string>('');
  const [bankLast4, setBankLast4] = useState<string>('');
  const [transferHistoryKey, setTransferHistoryKey] = useState(0);

  // Check for URL parameter to auto-open dialog
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('openAddFunds') === 'true') {
        setIsDialogOpen(true);
        // Clean up URL parameter without navigation
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, [router]);

  const handleOpenDialog = () => {
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
  };

  const handleFundingComplete = (amount: string, last4?: string) => {
    // Close the main dialog
    handleCloseDialog();
    
    // Store transfer details and show success dialog
    setTransferAmount(amount);
    setBankLast4(last4 || '');
    setIsSuccessDialogOpen(true);
    
    // Refresh transfer history
    setTransferHistoryKey(prev => prev + 1);
  };

  const handleSuccessDialogClose = () => {
    setIsSuccessDialogOpen(false);
    // Optionally refresh the page data here
    router.refresh();
  };

  return (
    <>
    <Card>
      <CardContent className="space-y-2 pt-6">
        <Button 
          onClick={handleOpenDialog}
          className="w-full flex gap-2 items-center justify-center bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white border-0 hover:shadow-lg transition-all duration-200 font-medium h-12 rounded-lg shadow-blue-500/20 shadow-md"
        >
          <PlusCircle className="h-4 w-4" />
          Add Funds
        </Button>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-md bg-card text-foreground border-border shadow-xl z-50">
              <DialogHeader className="pb-2 border-border">
                <DialogTitle className="text-xl text-foreground">Add Funds</DialogTitle>
            </DialogHeader>

              <div className="pt-2">
                <ManualBankForm
                  alpacaAccountId={alpacaAccountId || ''}
                  userName={userName}
                  onTransferComplete={handleFundingComplete}
                  onBack={handleCloseDialog}
                />
              </div>
          </DialogContent>
        </Dialog>
      </CardContent>

      {/* The TransferHistory component will now be rendered directly on the dashboard page */}
      {/* <TransferHistory key={transferHistoryKey} /> */}
    </Card>

      {/* Success Dialog */}
      <TransferSuccessDialog
        isOpen={isSuccessDialogOpen}
        onClose={handleSuccessDialogClose}
        amount={transferAmount}
        bankLast4={bankLast4}
      />
    </>
  );
} 