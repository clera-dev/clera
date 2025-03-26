"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import ManualBankForm from "./ManualBankForm";

interface ManualBankEntryProps {
  alpacaAccountId?: string;
  userName: string;
}

export default function ManualBankEntry({ 
  alpacaAccountId,
  userName
}: ManualBankEntryProps) {
  const [showForm, setShowForm] = useState(false);
  
  if (!alpacaAccountId) {
    return (
      <div className="text-red-500">
        Account ID not found. Please contact support.
      </div>
    );
  }
  
  if (showForm) {
    return (
      <ManualBankForm
        alpacaAccountId={alpacaAccountId}
        userName={userName}
      />
    );
  }
  
  return (
    <Button 
      onClick={() => setShowForm(true)}
      className="flex items-center gap-2"
    >
      Enter Account Details Manually
    </Button>
  );
} 