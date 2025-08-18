"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface OnboardingSuccessLoadingProps {
  accountId?: string;
  onComplete: () => void;
  onError: (error: string) => void;
}

export default function OnboardingSuccessLoading({ accountId, onComplete, onError }: OnboardingSuccessLoadingProps) {
  const [dots, setDots] = useState("");
  const [statusMessage, setStatusMessage] = useState("We're verifying some details and setting up your account");

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
    if (!accountId) {
      // Fallback to 3 seconds if no account ID provided (shouldn't happen)
      const timeout = setTimeout(() => {
        onComplete();
      }, 3000);
      return () => clearTimeout(timeout);
    }

    let pollCount = 0;
    const maxPolls = 60; // 5 minutes max (60 * 5 seconds)
    
    const pollAccountStatus = async () => {
      try {
        const response = await fetch('/api/account/status-poll', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ accountId }),
        });

        // Safely parse JSON only when present
        const contentType = response.headers.get('content-type') || '';
        let data: any = null;
        let nonJsonBody: string | null = null;

        if (response.status !== 204) {
          if (contentType.includes('application/json')) {
            try {
              data = await response.json();
            } catch (e) {
              // If JSON parsing fails, capture text for diagnostics on error paths
              try {
                nonJsonBody = await response.text();
              } catch {
                nonJsonBody = null;
              }
            }
          } else if (!response.ok) {
            // Non-JSON error body
            try {
              nonJsonBody = await response.text();
            } catch {
              nonJsonBody = null;
            }
          }
        }

        if (!response.ok) {
          // Handle different error scenarios
          if (response.status === 404) {
            setStatusMessage("We're still processing your account. This may take a few moments");
          } else {
            const errorMessage = (data && (data.error || data.message))
              || nonJsonBody
              || response.statusText
              || 'Failed to check account status';
            throw new Error(errorMessage);
          }
          return false; // Continue polling
        }

        // Update status message based on account state
        if (response.status === 204 || data == null) {
          // No content or no JSON body – keep polling with a generic message
          setStatusMessage("We're processing your account. Please wait");
          return false;
        }
        if (data.isPending) {
          if (data.status === 'APPROVAL_PENDING') {
            setStatusMessage("Your application is being reviewed. This usually takes just a few minutes");
          } else if (data.status === 'AML_REVIEW') {
            setStatusMessage("Additional security checks are being performed. This may take a bit longer");
          } else {
            setStatusMessage("We're verifying some details and setting up your account");
          }
          return false; // Continue polling
        }

        if (data.accountReady) {
          setStatusMessage("Success! Your account is ready");
          // Small delay to show success message
          setTimeout(() => onComplete(), 1000);
          return true; // Stop polling
        }

        if (data.accountFailed) {
          const errorMsg = data.status === 'ACTION_REQUIRED' 
            ? "Additional information is required to complete your account setup. Please review the requirements and contact support if needed."
            : data.status === 'DISABLED'
            ? "There was an issue with your account application. Please contact our support team for assistance."
            : "There was an issue with your account setup. Please try again or contact support.";
          
          onError(errorMsg);
          return true; // Stop polling
        }

        // Unknown status, continue polling but with generic message
        setStatusMessage("We're processing your account. Please wait");
        return false;

      } catch (error) {
        console.error('Error polling account status:', error);
        
        // On error, check if we should retry or give up
        if (pollCount >= 5) { // After 5 failed attempts, give up
          onError("We're experiencing technical difficulties. Please try refreshing the page or contact support if the issue persists.");
          return true; // Stop polling
        }
        
        setStatusMessage("Checking account status. Please wait");
        return false; // Continue polling
      }
    };

    // Start polling immediately
    pollAccountStatus();

    // Set up polling interval
    const pollInterval = setInterval(async () => {
      pollCount++;
      
      if (pollCount >= maxPolls) {
        clearInterval(pollInterval);
        onError("Account verification is taking longer than expected. Please refresh the page or contact support if the issue persists.");
        return;
      }

      const shouldStop = await pollAccountStatus();
      if (shouldStop) {
        clearInterval(pollInterval);
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(pollInterval);
  }, [accountId, onComplete, onError]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="max-w-md mx-auto text-center space-y-6">
        <div className="relative">
          <div className="absolute -top-16 -left-16 w-32 h-32 bg-primary/5 rounded-full blur-xl" />
          <div className="absolute -bottom-8 -right-8 w-24 h-24 bg-blue-500/5 rounded-full blur-lg" />
          <div className="bg-card border border-border/30 rounded-xl p-8 shadow-lg relative">
            <div className="flex justify-center mb-6">
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
            </div>
            
            <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
              Thank you for submitting your information!
            </h2>
            
            <p className="text-muted-foreground text-lg">
              {statusMessage}{dots}
            </p>
            
            <div className="mt-6 pt-6 border-t border-border/30">
              <p className="text-sm text-muted-foreground">
                This will only take a moment
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}