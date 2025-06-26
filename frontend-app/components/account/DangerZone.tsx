"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Trash2 } from "lucide-react";
import AccountClosureButton from "./AccountClosureButton";
import ClosureConfirmationModal from "./ClosureConfirmationModal";
import ClosureProcessModal from "./ClosureProcessModal";
import FinalConfirmationModal from "./FinalConfirmationModal";
import AccountClosureSuccess from "./AccountClosureSuccess";
import { useAccountClosure } from "@/hooks/useAccountClosure";

interface DangerZoneProps {
  accountId: string;
  userName: string;
}

export default function DangerZone({ accountId, userName }: DangerZoneProps) {
  const {
    isConfirmationModalOpen,
    setIsConfirmationModalOpen,
    isProcessModalOpen,
    setIsProcessModalOpen,
    isFinalModalOpen,
    setIsFinalModalOpen,
    showSuccessPage,
    closureState,
    initiateClosure,
    cancelClosure,
    finalConfirmClosure,
    navigateHome
  } = useAccountClosure(accountId);

  // Show success page if closure is complete
  if (showSuccessPage && closureState.isComplete) {
    return (
      <AccountClosureSuccess
        accountId={accountId}
        completionTimestamp={closureState.completionTimestamp || new Date().toISOString()}
        estimatedCompletion={closureState.estimatedCompletion || "Within 3-5 business days"}
        confirmationNumber={closureState.confirmationNumber || "CLA-ERROR-000"}
        onNavigateHome={navigateHome}
      />
    );
  }

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

      {/* Modals */}
      <ClosureConfirmationModal
        isOpen={isConfirmationModalOpen}
        onClose={() => setIsConfirmationModalOpen(false)}
        onConfirm={() => {
          setIsConfirmationModalOpen(false);
          setIsProcessModalOpen(true);
          initiateClosure();
        }}
        userName={userName}
      />

      <ClosureProcessModal
        isOpen={isProcessModalOpen}
        onClose={() => setIsProcessModalOpen(false)}
        onContinue={() => {
          setIsProcessModalOpen(false);
          setIsFinalModalOpen(true);
        }}
        onCancel={() => {
          setIsProcessModalOpen(false);
          cancelClosure();
        }}
        closureState={closureState}
      />

      <FinalConfirmationModal
        isOpen={isFinalModalOpen}
        onClose={() => setIsFinalModalOpen(false)}
        onConfirm={finalConfirmClosure}
        onCancel={() => {
          setIsFinalModalOpen(false);
          cancelClosure();
        }}
        userName={userName}
        closureState={closureState}
      />
    </>
  );
} 