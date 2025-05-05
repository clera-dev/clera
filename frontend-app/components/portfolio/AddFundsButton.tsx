"use client";

import React from 'react';
import { Button } from "@/components/ui/button";
import { DollarSign } from 'lucide-react';

// Placeholder component - Functionality to be added
interface AddFundsButtonProps {
  accountId: string | null;
  // apiKey: string | null; // Remove apiKey requirement
}

// const AddFundsButton: React.FC<AddFundsButtonProps> = ({ accountId, apiKey }) => {
const AddFundsButton: React.FC<AddFundsButtonProps> = ({ accountId }) => {

    const handleAddFunds = () => {
        // TODO: Implement actual add funds logic
        // This might involve: 
        // 1. Opening a modal
        // 2. Redirecting to an external funding page (e.g., Plaid, Stripe)
        // 3. Calling an internal API endpoint
        console.log("Add Funds Clicked! Account:", accountId);
        // For now, just alert
        alert("Add Funds functionality not yet implemented.");
    };

    // Disable button if account info is missing
    // const isDisabled = !accountId || !apiKey; // Remove apiKey check
    const isDisabled = !accountId;

    return (
        <Button onClick={handleAddFunds} disabled={isDisabled}>
            <DollarSign className="mr-2 h-4 w-4" /> Add Funds
        </Button>
    );
};

export default AddFundsButton; 