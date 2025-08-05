"use client";

import React from 'react';
import { Button } from "@/components/ui/button";
import { DollarSign } from 'lucide-react';
import { useRouter } from 'next/navigation';

// Component that redirects to dashboard with Add Funds dialog
interface AddFundsButtonProps {
  accountId: string | null;
}

const AddFundsButton: React.FC<AddFundsButtonProps> = ({ accountId }) => {
    const router = useRouter();

    const handleAddFunds = () => {
        // Redirect to dashboard with parameter to auto-open Add Funds dialog
        router.push('/dashboard?openAddFunds=true');
    };

    // Disable button if account info is missing
    const isDisabled = !accountId;

    return (
        <Button 
            onClick={handleAddFunds} 
            disabled={isDisabled}
            size="sm"
            className="h-8 px-3 text-sm sm:h-9 sm:px-4"
        >
            <DollarSign className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Add Funds
        </Button>
    );
};

export default AddFundsButton; 