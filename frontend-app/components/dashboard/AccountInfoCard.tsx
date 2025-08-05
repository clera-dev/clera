"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";

interface AccountInfoCardProps {
  alpacaAccountNumber?: string;
  alpacaAccountStatus?: string;
  created?: string;
}

export default function AccountInfoCard({
  alpacaAccountNumber,
  alpacaAccountStatus,
  created
}: AccountInfoCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Account Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Account Number</p>
          <p className="text-base font-medium">{alpacaAccountNumber || 'Processing...'}</p>
        </div>
        
        <div>
          <p className="text-sm font-medium text-muted-foreground">Status</p>
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${
              alpacaAccountStatus === 'ACTIVE' ? 'bg-green-500' : 
              alpacaAccountStatus === 'SUBMITTED' ? 'bg-yellow-500' : 'bg-gray-500'
            }`} />
            <p className="text-base font-medium capitalize">
              {alpacaAccountStatus?.toLowerCase().replace('_', ' ') || 'Processing...'}
            </p>
          </div>
        </div>
        
        {created && (
          <div>
            <p className="text-sm font-medium text-muted-foreground">Created</p>
            <p className="text-base font-medium flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-muted-foreground" />
              {new Date(created).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
              })}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
} 