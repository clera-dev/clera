// frontend-app/components/dashboard/PortfolioCard.tsx
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, AlertCircle } from "lucide-react";

interface PortfolioCardProps {
  alpacaAccountId: string;
}

export default function PortfolioCard({ alpacaAccountId }: PortfolioCardProps) {
  const [loading, setLoading] = useState(true);
  const [totalFunded, setTotalFunded] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAccountInfo = async () => {
      if (!alpacaAccountId) {
        setError("Account ID not found");
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        
        const response = await fetch(`/api/broker/account-info?accountId=${alpacaAccountId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch account information');
        }

        const data = await response.json();
        
        if (data && typeof data.total_funded === 'number') {
          setTotalFunded(data.total_funded);
        } else {
          console.warn('Invalid data format received:', data);
          setTotalFunded(0);
        }
        
        setError(null);
      } catch (error) {
        console.error('Error fetching account information:', error);
        setError(error instanceof Error ? error.message : 'Unable to load portfolio data');
      } finally {
        setLoading(false);
      }
    };

    fetchAccountInfo();
  }, [alpacaAccountId]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-medium">Portfolio</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center">
              <DollarSign className="h-4 w-4 mr-1 text-green-500" />
              Total Amount Funded
            </span>
            
            {loading ? (
              <Skeleton className="h-5 w-24" />
            ) : error ? (
              <div className="flex items-center text-red-500">
                <AlertCircle className="h-4 w-4 mr-1" />
                <span className="text-sm">Error loading</span>
              </div>
            ) : (
              <span className="font-semibold">
                ${totalFunded !== null ? totalFunded.toFixed(2) : '0.00'}
              </span>
            )}
          </div>
          
          {error && (
            <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-md text-xs text-red-700 dark:text-red-400">
              {error}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
