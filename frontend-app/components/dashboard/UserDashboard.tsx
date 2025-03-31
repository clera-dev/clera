"use client";

import { useState, useEffect } from "react";
import { InfoIcon } from "lucide-react";
import PortfolioCard from './PortfolioCard';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import ChatButton from "../chat/ChatButton";

interface UserDashboardProps {
  firstName: string;
  accountDetails: {
    bankAccountNumber: string;
    bankRoutingNumber: string;
    transferAmount?: string;
  }
}

export default function UserDashboard({
  firstName,
  accountDetails
}: UserDashboardProps) {
    const alpacaAccountId = localStorage.getItem('alpacaAccountId') || '';
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Hello, {firstName}</h1>
      <p className="text-muted-foreground">Welcome to your Clera account dashboard.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Bank Account Details Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-medium">Bank Account Details</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Existing bank details content */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Account Number</span>
                <span className="font-medium">{accountDetails.bankAccountNumber}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Routing Number</span>
                <span className="font-medium">{accountDetails.bankRoutingNumber}</span>
              </div>
              {accountDetails.transferAmount && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Transfer Amount</span>
                  <span className="font-medium">${accountDetails.transferAmount}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        {/* Portfolio Card - New addition */}
        <PortfolioCard alpacaAccountId={alpacaAccountId} />
      </div>
      
      {/* Chat Button */}
      {alpacaAccountId && <ChatButton accountId={alpacaAccountId} />}
    </div>
  );
}

/*
  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">
          Hi, {firstName}, my name is Clera.
        </h1>
        <p className="text-lg text-muted-foreground">
          Your account has been successfully funded and is ready for trading.
        </p>
      </div>
      
      <div className="bg-card rounded-lg border p-6 mb-8">
        <h2 className="text-xl font-bold mb-4">Bank Account Details</h2>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Account Number</p>
            <p className="font-medium">
              •••• •••• {accountDetails.bankAccountNumber.slice(-4)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Routing Number</p>
            <p className="font-medium">{accountDetails.bankRoutingNumber}</p>
          </div>
          {accountDetails.transferAmount && (
            <div>
              <p className="text-sm text-muted-foreground">Initial Funding Amount</p>
              <p className="font-medium">${accountDetails.transferAmount}</p>
            </div>
          )}
        </div>
      </div>
      
      <div className="bg-accent p-4 rounded-lg flex items-start gap-3">
        <InfoIcon className="text-accent-foreground mt-1" size={18} />
        <div>
          <p className="text-accent-foreground font-medium">
            What's Next?
          </p>
          <p className="text-accent-foreground text-sm mt-1">
            Your account is being funded. This process typically takes 1-3 business days.
            Once completed, you can start trading.
          </p>
        </div>
      </div>
    </div>
  );
} 
  */