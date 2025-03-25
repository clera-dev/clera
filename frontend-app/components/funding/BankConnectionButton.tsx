"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Link as LinkIcon } from "lucide-react";
import TransferForm from "./TransferForm";

interface BankConnectionButtonProps {
  alpacaAccountId?: string;
  email?: string;
}

export default function BankConnectionButton({ 
  alpacaAccountId,
  email 
}: BankConnectionButtonProps) {
  const [isConnectingBank, setIsConnectingBank] = useState(false);
  const [bankConnected, setBankConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [transferCompleted, setTransferCompleted] = useState(false);
  const [transferAmount, setTransferAmount] = useState<string | null>(null);
  const [relationshipId, setRelationshipId] = useState<string | null>(null);
  const [checkCount, setCheckCount] = useState(0);
  const [isPolling, setIsPolling] = useState(false);

  // Check if we're returning from Plaid redirect
  useEffect(() => {
    const checkForPlaidRedirect = () => {
      // Check for account_id in URL query parameters
      const urlParams = new URLSearchParams(window.location.search);
      const accountIdFromUrl = urlParams.get('account_id');
      
      if (accountIdFromUrl && alpacaAccountId) {
        console.log("Detected return from Plaid redirect, checking bank status");
        setIsConnectingBank(true);
        
        // Start polling for bank connection
        startPollingForConnection(alpacaAccountId);
      }
    };
    
    checkForPlaidRedirect();
  }, [alpacaAccountId]);
  
  // Regular check on component mount
  useEffect(() => {
    if (alpacaAccountId && !bankConnected && !isConnectingBank && !isPolling) {
      checkBankStatus(alpacaAccountId);
    }
  }, [alpacaAccountId, bankConnected, isConnectingBank, isPolling]);
  
  // Setup event listener for Plaid Link success message
  useEffect(() => {
    if (!alpacaAccountId) return;
    
    const handlePlaidMessage = (event: MessageEvent) => {
      console.log("Received message from Plaid window:", event.data);
      
      if (event.data.action === 'plaid_link_success' && event.data.public_token) {
        // Handle successful Plaid link with public token
        console.log("Received public token from Plaid");
        handlePlaidSuccess(event.data.public_token);
      } 
      else if (event.data.action === 'plaid_oauth_success' && event.data.account_id) {
        // Handle OAuth success without public token - start polling
        console.log("Received OAuth success without public token, starting polling");
        startPollingForConnection(alpacaAccountId);
      }
    };
    
    // Add the message listener
    window.addEventListener('message', handlePlaidMessage);
    
    // Clean up
    return () => {
      window.removeEventListener('message', handlePlaidMessage);
    };
  }, [alpacaAccountId]);
  
  // Function to start polling for bank connection
  const startPollingForConnection = useCallback((accountId: string) => {
    setIsConnectingBank(true);
    setIsPolling(true);
    
    // Reset check count
    setCheckCount(0);
    
    // Start polling
    pollBankStatus(accountId);
  }, []);
  
  // Function to poll bank status at regular intervals
  const pollBankStatus = useCallback(async (accountId: string) => {
    // Configuration for polling
    const initialInterval = 1000; // 1 second
    const maxInterval = 3000; // 3 seconds
    const maxAttempts = 12; // Try for at least 30 seconds total
    
    let attempts = 0;
    let currentInterval = initialInterval;
    
    const checkStatusInterval = setInterval(async () => {
      attempts++;
      setCheckCount(attempts);
      console.log(`Checking bank status attempt ${attempts}...`);
      
      try {
        const isConnected = await checkBankStatus(accountId);
        
        if (isConnected) {
          console.log("Bank connection successful!");
          clearInterval(checkStatusInterval);
          setIsConnectingBank(false);
          setIsPolling(false);
          return;
        }
        
        if (attempts >= maxAttempts) {
          console.log("Max attempts reached, stopping polling");
          clearInterval(checkStatusInterval);
          setIsConnectingBank(false);
          setIsPolling(false);
          setConnectionError("Bank connection timed out. This may take a few minutes to complete. Please refresh the page or try again.");
        }
      } catch (error) {
        console.error("Error during polling:", error);
        // Continue polling despite errors
      }
    }, currentInterval);
    
    // Clean up interval on component unmount
    return () => {
      clearInterval(checkStatusInterval);
      setIsPolling(false);
    };
  }, []);
  
  // Function to check if bank is connected
  const checkBankStatus = async (accountId: string): Promise<boolean> => {
    try {
      // Check if we already have a relationship
      const statusResponse = await fetch(`/api/broker/bank-status?accountId=${accountId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        console.log("Bank status response:", statusData);
        
        if (statusData.relationships && statusData.relationships.length > 0) {
          // Get active relationships
          const activeRelationships = statusData.relationships.filter(
            (rel: any) => rel.status === 'APPROVED' || rel.status === 'ACTIVE'
          );
          
          if (activeRelationships.length > 0) {
            // Bank account connected successfully with an active relationship
            setBankConnected(true);
            setRelationshipId(activeRelationships[0].id);
            console.log("Bank connected successfully:", activeRelationships[0]);
            return true;
          }
          
          // If we have relationships but none are active yet, keep polling
          console.log("Found relationships but none are active yet:", statusData.relationships);
          return false;
        }
      }
      
      return false;
    } catch (error) {
      console.error("Error checking bank status:", error);
      return false;
    }
  };
  
  // Function to handle public token from Plaid
  const handlePlaidSuccess = async (publicToken: string) => {
    if (!alpacaAccountId) {
      setConnectionError("Missing account ID. Please refresh the page and try again.");
      return;
    }
    
    setIsConnectingBank(true);
    
    try {
      console.log(`Processing Plaid public token for account ${alpacaAccountId}`);
      
      // Call our API to exchange the public token and create an ACH relationship
      const response = await fetch('/api/broker/process-plaid-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          publicToken: publicToken,
          accountId: alpacaAccountId
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process Plaid token');
      }
      
      const data = await response.json();
      console.log("Successfully processed Plaid token:", data);
      
      // Start polling for bank status
      startPollingForConnection(alpacaAccountId);
    } catch (error) {
      console.error('Error handling Plaid success:', error);
      setConnectionError(error instanceof Error ? error.message : 'An unknown error occurred');
      setIsConnectingBank(false);
      setIsPolling(false);
    }
  };
  
  // Function to initiate Plaid Link
  const handleConnectWithPlaid = async () => {
    if (!alpacaAccountId || !email) {
      setConnectionError("Missing account information. Please refresh the page and try again.");
      return;
    }

    try {
      setIsConnectingBank(true);
      setConnectionError(null);
      
      // Get the current origin for the redirect URI
      const origin = window.location.origin;
      
      // Use plaid-success.html as the redirect target with account_id parameter
      const redirectUri = `${origin}/plaid-success.html?account_id=${alpacaAccountId}`;
      
      // Call the API route that will initiate the Plaid connection
      const response = await fetch('/api/broker/connect-bank', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          email,
          redirectUri
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to connect bank account');
      }
      
      const linkData = await response.json();
      
      if (!linkData.linkUrl) {
        throw new Error('No link URL received from server');
      }
      
      console.log("Opening Plaid Link URL:", linkData.linkUrl);
      
      // Open Plaid Link in a new window
      const plaidLinkWindow = window.open(linkData.linkUrl, 'Plaid Link', 'width=600,height=600');
      
      if (!plaidLinkWindow) {
        throw new Error('Popup blocked. Please allow popups for this site to connect your bank.');
      }
      
      // If the window is closed without success, clean up
      const checkWindowClosed = setInterval(() => {
        if (plaidLinkWindow && plaidLinkWindow.closed) {
          clearInterval(checkWindowClosed);
          
          // Don't immediately reset connecting state - check if bank connection was successful
          checkBankStatus(alpacaAccountId).then(isConnected => {
            // Only reset connecting state if not connected yet
            if (!isConnected && !isPolling) {
              setIsConnectingBank(false);
            }
          });
        }
      }, 500);
      
    } catch (error) {
      console.error('Error connecting bank account:', error);
      setConnectionError(error instanceof Error ? error.message : 'An unknown error occurred');
      setIsConnectingBank(false);
    }
  };

  const handleTransferComplete = (amount: string) => {
    setTransferCompleted(true);
    setTransferAmount(amount);
  };

  // If transfer is completed, show success message
  if (transferCompleted && transferAmount) {
    return (
      <div className="w-full">
        <div className="p-4 mb-6 border border-green-200 rounded-lg bg-green-50">
          <h4 className="font-medium text-green-800 mb-1">Transfer initiated!</h4>
          <p className="text-green-700 text-sm">
            Your transfer of ${parseFloat(transferAmount).toFixed(2)} has been initiated. 
            Funds may take 1-3 business days to process.
          </p>
        </div>
      </div>
    );
  }

  // If bank is connected, show transfer form
  if (bankConnected && relationshipId && alpacaAccountId) {
    return (
      <TransferForm 
        alpacaAccountId={alpacaAccountId} 
        relationshipId={relationshipId}
        onTransferComplete={handleTransferComplete}
      />
    );
  }

  return (
    <div className="w-full">
      {connectionError && (
        <div className="p-4 mb-6 border border-red-200 rounded-lg bg-red-50">
          <h4 className="font-medium text-red-800 mb-1">Error connecting bank account</h4>
          <p className="text-red-700 text-sm">{connectionError}</p>
          <Button 
            onClick={() => setConnectionError(null)}
            variant="outline"
            size="sm"
            className="mt-2"
          >
            Dismiss
          </Button>
        </div>
      )}
      
      {isConnectingBank && (
        <div className="p-4 mb-6 border border-blue-200 rounded-lg bg-blue-50">
          <h4 className="font-medium text-blue-800 mb-1">Connecting to your bank</h4>
          <div className="flex items-center gap-2">
            <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
            <p className="text-blue-700 text-sm">
              {checkCount > 0 ? `Checking bank connection status (attempt ${checkCount})...` : 'Preparing connection...'}
            </p>
          </div>
          <p className="text-blue-600 text-xs mt-2">
            This process may take a moment. Please wait while we establish the connection.
          </p>
        </div>
      )}
      
      <Button 
        onClick={handleConnectWithPlaid}
        className="flex items-center gap-2 px-8"
        disabled={isConnectingBank || !alpacaAccountId}
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
  );
} 