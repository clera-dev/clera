"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import ManualBankForm from "./ManualBankForm";

interface ManualBankEntryProps {
  alpacaAccountId?: string;
  userName: string;
  onStartConnection?: () => void;
  onBack?: () => void;
  onTransferComplete?: () => void;
  showFullForm?: boolean;
}

export default function ManualBankEntry({ 
  alpacaAccountId,
  userName,
  onStartConnection,
  onBack,
  onTransferComplete,
  showFullForm = false
}: ManualBankEntryProps) {
  const [showForm, setShowForm] = useState(showFullForm);
  
  // Synchronize internal state with prop to maintain single source of truth
  useEffect(() => {
    setShowForm(showFullForm);
  }, [showFullForm]);
  
  // Scroll to top when entering full form mode
  useEffect(() => {
    if (showFullForm) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
  }, [showFullForm]);
  
  if (!alpacaAccountId) {
    return (
      <div className="text-red-500">
        Account ID not found. Please try refreshing or contact support.
      </div>
    );
  }
  
  if (showForm) {
    return (
      <ManualBankForm
        alpacaAccountId={alpacaAccountId}
        userName={userName}
        onBack={onBack}
        onTransferComplete={onTransferComplete}
      />
    );
  }
  
  const handleConnectClick = () => {
    if (onStartConnection) {
      // Navigate to the full-page step
      onStartConnection();
    } else {
      // Fallback to showing inline form
      setShowForm(true);
    }
  };
  
  return (
    <Button 
      onClick={handleConnectClick}
      size="lg"
      className="w-full h-12 bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
    >
      Connect Bank Account
    </Button>
  );
} 