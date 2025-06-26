"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

interface BankAccountDetailsProps {
  accountDetails: {
    bankName?: string | null; 
    bankAccountLast4?: string | null;
    latestTransferAmount?: number | null; 
    latestTransferStatus?: string | null;
  } | null;
}

export default function BankAccountDetails({ accountDetails }: BankAccountDetailsProps) {
  const displayBankName = accountDetails?.bankName || "Not Connected";
  const displayLast4 = accountDetails?.bankAccountLast4 ? `•••• ${accountDetails.bankAccountLast4}` : "N/A";
  const displayTransferAmount = accountDetails?.latestTransferAmount 
    ? formatCurrency(accountDetails.latestTransferAmount)
    : null;
  const displayTransferStatus = accountDetails?.latestTransferStatus;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-medium">Bank Account Details</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Bank Name</span>
            <span className="font-medium">{displayBankName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Account (Last 4)</span>
            <span className="font-medium">{displayLast4}</span>
          </div>
          {displayTransferAmount !== null && (
            <div className="flex items-center justify-between pt-2 border-t mt-2">
              <span className="text-muted-foreground">Latest Transfer</span>
              <span className="font-medium">
                {displayTransferAmount}
                {displayTransferStatus && <span className="text-xs text-muted-foreground ml-1">({displayTransferStatus})</span>}
              </span>
            </div>
          )}
           {displayBankName === "Not Connected" && (
             <p className="text-sm text-muted-foreground pt-2 border-t mt-2">
                Connect a bank account to enable funding.
             </p>
           )} 
        </div>
      </CardContent>
    </Card>
  );
} 