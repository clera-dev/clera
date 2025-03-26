"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link as LinkIcon, PlusCircle } from "lucide-react";
import BankConnectionButton from "@/components/funding/BankConnectionButton";

interface BankAccount {
  id: string;
  status: string;
  accountId: string;
  createdAt: string;
  bankName?: string;
  nickname?: string;
}

interface BankConnectionsCardProps {
  alpacaAccountId?: string;
  email?: string;
}

export default function BankConnectionsCard({
  alpacaAccountId,
  email
}: BankConnectionsCardProps) {
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddBank, setShowAddBank] = useState(false);

  useEffect(() => {
    const fetchBankAccounts = async () => {
      if (!alpacaAccountId) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(`/api/broker/bank-status?accountId=${alpacaAccountId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        });

        if (!response.ok) {
          throw new Error("Failed to fetch bank accounts");
        }

        const data = await response.json();
        
        if (data.relationships && Array.isArray(data.relationships)) {
          setBankAccounts(data.relationships.map((rel: any) => ({
            id: rel.id,
            status: rel.status,
            accountId: rel.account_id,
            createdAt: rel.created_at,
            bankName: rel.bank_name,
            nickname: rel.nickname
          })));
        }
      } catch (error) {
        console.error("Error fetching bank accounts:", error);
        setError("Could not load bank accounts");
      } finally {
        setIsLoading(false);
      }
    };

    fetchBankAccounts();
  }, [alpacaAccountId]);

  const handleAddBankClick = () => {
    setShowAddBank(true);
  };

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Connected Banks</CardTitle>
        {bankAccounts.length > 0 && !showAddBank && (
          <Button 
            size="sm" 
            variant="outline" 
            className="h-8 gap-1"
            onClick={handleAddBankClick}
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Add Bank
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-4">
            <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : error ? (
          <div className="text-sm text-red-500">{error}</div>
        ) : showAddBank || bankAccounts.length === 0 ? (
          <div className="space-y-4">
            {bankAccounts.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Add another bank account to fund your Alpaca account.
              </p>
            )}
            <BankConnectionButton alpacaAccountId={alpacaAccountId} email={email} />
          </div>
        ) : (
          <div className="space-y-4">
            {bankAccounts.map((account) => (
              <div 
                key={account.id} 
                className="flex items-center justify-between border p-3 rounded-lg"
              >
                <div className="space-y-1">
                  <p className="font-medium">
                    {account.bankName || account.nickname || "Bank Account"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Connected on {new Date(account.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${
                    account.status === 'APPROVED' ? 'bg-green-500' : 
                    account.status === 'QUEUED' ? 'bg-yellow-500' : 'bg-gray-500'
                  }`} />
                  <span className="text-xs font-medium capitalize">
                    {account.status.toLowerCase()}
                  </span>
                </div>
              </div>
            ))}
            
            <div className="text-center pt-2">
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-xs gap-1"
                onClick={handleAddBankClick}
              >
                <PlusCircle className="h-3 w-3" />
                Add another bank account
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
} 