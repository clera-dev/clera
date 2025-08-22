"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { useRouter } from "next/navigation";

interface BankConnectionsCardProps {
  alpacaAccountId?: string;
  email?: string;
  userName?: string;
}

export default function BankConnectionsCard({
  alpacaAccountId,
  userName = 'User'
}: BankConnectionsCardProps) {
  const router = useRouter();

  const navigateToAddFunds = () => {
    router.push('/account/add-funds');
  };

  return (
    <>
    <Card>
      <CardContent className="space-y-2 pt-6">
        <Button 
          onClick={navigateToAddFunds}
          className="w-full flex gap-2 items-center justify-center bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white border-0 hover:shadow-lg transition-all duration-200 font-medium h-12 rounded-lg shadow-blue-500/20 shadow-md"
        >
          <PlusCircle className="h-4 w-4" />
          Add Funds
        </Button>
      </CardContent>

    </Card>
    </>
  );
} 