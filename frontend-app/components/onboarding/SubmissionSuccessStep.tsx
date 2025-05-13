"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { OnboardingData } from "./OnboardingTypes";
import { Check as CheckIcon, XCircle as XCircleIcon, Link as LinkIcon } from "lucide-react";
import { usePostOnboardingNavigation } from "@/utils/navigation";

interface SubmissionSuccessStepProps {
  data: OnboardingData;
  accountCreated: boolean;
  accountExists?: boolean;
  errorMessage?: string;
  onBack: () => void;
  onReset: () => void;
  onComplete: () => void;
}

export default function SubmissionSuccessStep({ 
  data,
  accountCreated, 
  accountExists,
  errorMessage,
  onBack,
  onReset,
  onComplete
}: SubmissionSuccessStepProps) {
  const router = useRouter();
  const { navigateAfterOnboarding } = usePostOnboardingNavigation();
  const [isConnectingBank, setIsConnectingBank] = useState(false);
  const [bankConnected, setBankConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const handleConnectWithPlaid = async () => {
    try {
      setIsConnectingBank(true);
      setConnectionError(null);
      
      // Call the API route that will initiate the Plaid connection
      const response = await fetch('/api/broker/connect-bank', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: data.email
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to connect bank account');
      }
      
      const linkData = await response.json();
      
      // Open Plaid Link to guide the user through the bank connection flow
      if (linkData.linkToken) {
        // This will be handled by the Plaid Link component we'll implement
        window.open(linkData.linkUrl, '_blank');
        setBankConnected(true);
      } else {
        throw new Error('No link token received from server');
      }
    } catch (error) {
      console.error('Error connecting bank account:', error);
      setConnectionError(error instanceof Error ? error.message : 'An unknown error occurred');
    } finally {
      setIsConnectingBank(false);
    }
  };

  if (accountCreated || accountExists) {
    return (
      <div className="w-full max-w-3xl mx-auto py-8 px-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
            <CheckIcon className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold">Account {accountExists ? 'Verified' : 'Created'} Successfully!</h2>
          <p className="text-lg text-muted-foreground mt-2">
            {accountExists 
              ? `We've verified your existing Alpaca account. You're all set to start using Clera!` 
              : `Your Alpaca account has been created. You're all set to start using Clera!`}
          </p>
        </div>
        
        <div className="p-4 border rounded-lg bg-muted/50 mb-6">
          <h3 className="font-medium mb-2">Account Information</h3>
          <p className="mb-2">Name: {data.firstName} {data.lastName}</p>
          <p className="mb-2">Email: {data.email}</p>
        </div>
        
        <div className="text-center mb-8">
          <h3 className="text-xl font-semibold mb-2">Next Steps</h3>
          <p className="text-muted-foreground">
            You've successfully made your account! Now, let's get your account funded to start trading.
          </p>
        </div>
        
        {connectionError && (
          <div className="p-4 mb-6 border border-red-200 rounded-lg bg-red-50">
            <h4 className="font-medium text-red-800 mb-1">Error connecting bank account</h4>
            <p className="text-red-700 text-sm">{connectionError}</p>
          </div>
        )}
        
        {bankConnected ? (
          <div className="p-4 mb-6 border border-green-200 rounded-lg bg-green-50">
            <h4 className="font-medium text-green-800 mb-1">Bank account connected!</h4>
            <p className="text-green-700 text-sm">
              Your bank account has been successfully connected. You can now fund your Alpaca account.
            </p>
          </div>
        ) : (
          <div className="flex justify-center mb-6">
            <Button 
              onClick={handleConnectWithPlaid}
              className="flex items-center gap-2 px-8"
              disabled={isConnectingBank}
            >
              {isConnectingBank ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-1" />
                  Connecting...
                </>
              ) : (
                <>
                  <LinkIcon className="h-4 w-4" />
                  Connect with Plaid
                </>
              )}
            </Button>
          </div>
        )}
        
        <div className="flex justify-center">
          <Button 
            onClick={onComplete}
            className="px-8"
          >
            Continue to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto py-8 px-4">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
          <XCircleIcon className="h-8 w-8 text-red-600" />
        </div>
        <h2 className="text-2xl font-bold">Submission Error</h2>
        <p className="text-lg text-muted-foreground mt-2">
          We encountered an issue while processing your application.
        </p>
      </div>
      
      <div className="p-4 border border-red-200 rounded-lg bg-red-50 mb-6">
        <h3 className="font-medium text-red-800 mb-2">Error Details</h3>
        <p className="text-red-700">{errorMessage || "An unknown error occurred"}</p>
      </div>
      
      <div className="flex flex-col md:flex-row justify-center gap-4">
        <Button 
          onClick={onReset}
          variant="default"
        >
          Start Over
        </Button>
      </div>
    </div>
  );
} 