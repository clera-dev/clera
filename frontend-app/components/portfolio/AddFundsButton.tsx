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
        <Button onClick={handleAddFunds} disabled={isDisabled}>
            <DollarSign className="mr-2 h-4 w-4" /> Add Funds
        </Button>
    );
};

export default AddFundsButton; 