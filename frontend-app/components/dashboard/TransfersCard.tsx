"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatTransferStatus, getTransferStatusDotColor } from "@/lib/utils/transfer-formatting";

interface Transfer {
  id: string;
  user_id: string;
  alpaca_account_id: string;
  relationship_id: string;
  amount: number;
  transfer_id: string;
  status: string;
  created_at: string;
}

interface TransfersCardProps {
  transfers: Transfer[];
}

export default function TransfersCard({ transfers }: TransfersCardProps) {
  const [expandedTransfer, setExpandedTransfer] = useState<string | null>(null);

  if (transfers.length === 0) {
    return null;
  }

  const toggleTransferDetails = (id: string) => {
    if (expandedTransfer === id) {
      setExpandedTransfer(null);
    } else {
      setExpandedTransfer(id);
    }
  };

  // Utility functions moved to @/lib/utils/transfer-formatting

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          Recent Transfers
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <InfoIcon className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs text-sm">
                  Funds may take 1-3 business days to process. Once processed, they will be available for trading.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {transfers.map((transfer) => (
            <div 
              key={transfer.id} 
              className="border rounded-lg overflow-hidden"
            >
              <div 
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50"
                onClick={() => toggleTransferDetails(transfer.id)}
              >
                <div className="space-y-1">
                  <p className="font-medium">${transfer.amount.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(transfer.created_at).toLocaleDateString()} at {' '}
                    {new Date(transfer.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${getTransferStatusDotColor(transfer.status)}`} />
                  <span className="text-xs font-medium">
                    {formatTransferStatus(transfer.status)}
                  </span>
                </div>
              </div>
              
              {expandedTransfer === transfer.id && (
                <div className="p-3 bg-muted/30 border-t text-sm space-y-2">
                  <p><span className="font-medium">Transfer ID:</span> {transfer.transfer_id}</p>
                  <p><span className="font-medium">Status:</span> {formatTransferStatus(transfer.status)}</p>
                  <p className="flex items-center gap-1.5">
                    <span className="font-medium">Processing time:</span> 
                    <span className="text-xs text-muted-foreground">1-3 business days</span>
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
} 