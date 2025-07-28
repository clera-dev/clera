"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, CheckCircle } from "lucide-react";

interface TransferSuccessDialogProps {
  isOpen: boolean;
  onClose: () => void;
  amount: string;
  bankLast4?: string;
}

export default function TransferSuccessDialog({
  isOpen,
  onClose,
  amount,
  bankLast4
}: TransferSuccessDialogProps) {
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-card border-border shadow-xl z-50">
        <DialogHeader className="relative">
          <DialogTitle className="sr-only">Transfer Success</DialogTitle>
        </DialogHeader>

        <div className="text-center py-6">
          {/* Success Icon */}
          <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
          </div>

          {/* Success Message */}
          <h2 className="text-2xl font-bold text-foreground mb-3">
            Transfer Initiated! 🎉
          </h2>
          
          <p className="text-lg text-foreground mb-4">
            Your transfer has been successfully submitted
          </p>
          
          {/* Transfer Details */}
          <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-6 mb-6">
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
                <span className="text-emerald-800 dark:text-emerald-200 font-semibold text-lg">
                  {parseFloat(amount).toFixed(2)}
                </span>
              </div>
              
              {bankLast4 && (
                <p className="text-emerald-700 dark:text-emerald-300 text-sm">
                  From account ending in ••••{bankLast4}
                </p>
              )}
              
              <div className="border-t border-emerald-200 dark:border-emerald-800 pt-3">
                <p className="text-emerald-800 dark:text-emerald-200 font-medium text-sm mb-1">
                  Processing Time
                </p>
                <p className="text-emerald-700 dark:text-emerald-300 text-sm">
                  Your funds will be available in your account within 1-3 business days
                </p>
              </div>
            </div>
          </div>

          {/* Additional Information */}
          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
            <p className="text-blue-800 dark:text-blue-200 text-sm">
              💡 <strong>What's Next:</strong> While your funds are processing, you can explore our research tools, 
              set up watchlists, and learn about investment strategies on the invest page.
            </p>
          </div>

          {/* Close Button */}
          <Button 
            onClick={onClose}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-medium h-12 rounded-lg transition-all duration-200 hover:shadow-lg shadow-blue-500/20 shadow-md"
          >
            Continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
} 