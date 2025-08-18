"use client";

import { useEffect, useState } from "react";
import { Loader2, DollarSign } from "lucide-react";

interface FundingSuccessLoadingProps {
  transferId?: string;
  accountId?: string;
  amount: string;
  onComplete: () => void;
  onError: (error: string) => void;
}

export default function FundingSuccessLoading({ transferId, accountId, amount, onComplete, onError }: FundingSuccessLoadingProps) {
  const [dots, setDots] = useState("");
  const [statusMessage, setStatusMessage] = useState("Processing your transfer");

  useEffect(() => {
    // Animate the loading dots
    const interval = setInterval(() => {
      setDots(prev => {
        if (prev === "...") return "";
        return prev + ".";
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!transferId) {
      // Fallback to 3 seconds if no transfer ID provided (shouldn't happen)
      const timeout = setTimeout(() => {
        onComplete();
      }, 3000);
      return () => clearTimeout(timeout);
    }

    let pollCount = 0;
    const maxPolls = 40; // 3.5 minutes max (40 * 5 seconds)
    
    const pollTransferStatus = async () => {
      try {
        const response = await fetch(`/api/transfer/status-poll?transferId=${encodeURIComponent(transferId || '')}&accountId=${encodeURIComponent(accountId || '')}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        const data = await response.json();

        if (!response.ok) {
          // Handle different error scenarios
          if (response.status === 404) {
            setStatusMessage("We're still processing your transfer. This may take a few moments");
          } else {
            throw new Error(data.error || 'Failed to check transfer status');
          }
          return false; // Continue polling
        }

        // Update status message based on transfer state
        if (data.isPending) {
          if (data.status === 'SUBMITTED') {
            setStatusMessage("Your transfer has been submitted and is being reviewed");
          } else if (data.status === 'PENDING_REVIEW') {
            setStatusMessage("Additional verification is being performed on your transfer");
          } else if (data.status === 'QUEUED') {
            setStatusMessage("Your transfer is queued for processing");
          } else {
            setStatusMessage("Processing your transfer");
          }
          return false; // Continue polling
        }

        if (data.transferReady) {
          if (data.status === 'COMPLETED') {
            setStatusMessage("Success! Your transfer has been completed");
          } else if (data.status === 'SETTLED') {
            setStatusMessage("Success! Your transfer has been settled");
          } else {
            setStatusMessage("Success! Your transfer is complete");
          }
          // Small delay to show success message
          setTimeout(() => onComplete(), 1500);
          return true; // Stop polling
        }

        if (data.transferFailed) {
          const errorMsg = data.status === 'REJECTED' 
            ? "Your transfer was rejected. This may be due to insufficient funds or bank account issues. Please check your account and try again."
            : data.status === 'CANCELLED'
            ? "Your transfer was cancelled. Please try again or contact support if you didn't cancel this transfer."
            : "There was an issue processing your transfer. Please try again or contact support if the problem persists.";
          
          onError(errorMsg);
          return true; // Stop polling
        }

        // Unknown status, continue polling but with generic message
        setStatusMessage("Processing your transfer. Please wait");
        return false;

      } catch (error) {
        console.error('Error polling transfer status:', error);
        
        // On error, check if we should retry or give up
        if (pollCount >= 5) { // After 5 failed attempts, give up
          onError("We're experiencing technical difficulties checking your transfer status. Your transfer may still be processing. Please check your account or contact support if you have concerns.");
          return true; // Stop polling
        }
        
        setStatusMessage("Checking transfer status. Please wait");
        return false; // Continue polling
      }
    };

    // Start polling immediately
    pollTransferStatus();

    // Set up polling interval
    const pollInterval = setInterval(async () => {
      pollCount++;
      
      if (pollCount >= maxPolls) {
        clearInterval(pollInterval);
        onError("Transfer verification is taking longer than expected. Your transfer may still be processing successfully. Please check your account or contact support if you have concerns.");
        return;
      }

      const shouldStop = await pollTransferStatus();
      if (shouldStop) {
        clearInterval(pollInterval);
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(pollInterval);
  }, [transferId, accountId, onComplete, onError]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="max-w-md mx-auto text-center space-y-6">
        <div className="relative">
          <div className="absolute -top-16 -left-16 w-32 h-32 bg-green-500/5 rounded-full blur-xl" />
          <div className="absolute -bottom-8 -right-8 w-24 h-24 bg-blue-500/5 rounded-full blur-lg" />
          <div className="bg-card border border-border/30 rounded-xl p-8 shadow-lg relative">
            <div className="flex justify-center mb-6">
              <div className="relative">
                <Loader2 className="h-12 w-12 text-green-600 animate-spin" />
                <DollarSign className="h-6 w-6 text-green-600 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
              </div>
            </div>
            
            <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent">
              Transfer Submitted Successfully!
            </h2>
            
            <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-center gap-2">
                <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
                <span className="text-green-800 dark:text-green-200 font-semibold text-lg">
                  ${parseFloat(amount).toFixed(2)}
                </span>
              </div>
            </div>
            
            <p className="text-muted-foreground text-lg">
              {statusMessage}{dots}
            </p>
            
            <div className="mt-6 pt-6 border-t border-border/30">
              <p className="text-sm text-muted-foreground">
                This usually takes just a moment
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
