"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Trash2 } from "lucide-react";
import AccountClosureButton from "./AccountClosureButton";
import ClosureConfirmationModal from "./ClosureConfirmationModal";
import { useClosureInitiation } from "@/hooks/useClosureInitiation";

interface DangerZoneProps {
  accountId: string;
  userName: string;
}

export default function DangerZone({ accountId, userName }: DangerZoneProps) {
  const [achRelationshipId, setAchRelationshipId] = useState<string>('');
  
  const {
    isConfirmationModalOpen,
    setIsConfirmationModalOpen,
    closureState,
    initiateClosure
  } = useClosureInitiation(accountId);

  // Fetch ACH relationship ID when component mounts
  useEffect(() => {
    const fetchAchRelationshipId = async () => {
      try {
        const response = await fetch(`/api/broker/bank-status?accountId=${accountId}`);
        const data = await response.json();
        if (data.relationships && data.relationships.length > 0) {
          setAchRelationshipId(data.relationships[0].id);
        }
      } catch (error) {
        console.error('Failed to fetch ACH relationship ID:', error);
      }
    };
    fetchAchRelationshipId();
  }, [accountId]);

  // NOTE: No success page logic here - user redirects to /protected immediately

  return (
    <>
      <Card className="border border-border">
        <CardHeader className="pb-4">
          <CardTitle className="text-foreground">
            Account Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            {/* Account Closure Section */}
            <div className="border border-border rounded-lg p-6 bg-card">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground mb-2">Close Account</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Permanently close your investment account. This action will liquidate all positions 
                    and transfer remaining funds to your linked bank account.
                  </p>
                </div>
              </div>
              
              {/* Warning Box */}
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 rounded-md p-4 mb-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      This action cannot be undone
                    </p>
                    <div className="space-y-1.5 text-xs text-amber-700 dark:text-amber-300">
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-1 bg-amber-600 dark:bg-amber-400 rounded-full"></div>
                        <span>All open orders will be cancelled</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-1 bg-amber-600 dark:bg-amber-400 rounded-full"></div>
                        <span>All positions will be liquidated at current market prices</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-1 bg-amber-600 dark:bg-amber-400 rounded-full"></div>
                        <span>Funds will be transferred to your linked bank account</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-1 bg-amber-600 dark:bg-amber-400 rounded-full"></div>
                        <span>Account will be permanently closed and cannot be reopened</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-1 bg-amber-600 dark:bg-amber-400 rounded-full"></div>
                        <span>Historical data will be preserved for regulatory compliance</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <AccountClosureButton 
                onInitiateClosure={() => setIsConfirmationModalOpen(true)}
                disabled={closureState.isProcessing}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Only the initial confirmation modal - user redirects immediately after */}
      <ClosureConfirmationModal
        isOpen={isConfirmationModalOpen}
        onClose={() => setIsConfirmationModalOpen(false)}
        onConfirm={() => {
          setIsConfirmationModalOpen(false);
          initiateClosure(achRelationshipId);
        }}
        userName={userName}
      />
    </>
  );
} 