"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { OnboardingData } from "./OnboardingTypes";

interface AgreementsStepProps {
  data: OnboardingData;
  onUpdate: (data: Partial<OnboardingData>) => void;
  onContinue: () => void;
  onBack: () => void;
}

export default function AgreementsStep({
  data,
  onUpdate,
  onContinue,
  onBack
}: AgreementsStepProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // Update agreements list to remove crypto
  const agreements = [
    {
      id: "customer",
      label: "Customer Agreement",
      description: "Terms governing your account relationship with us."
    },
    {
      id: "account",
      label: "Account Agreement",
      description: "Specific terms for your brokerage account."
    },
    {
      id: "margin",
      label: "Margin Agreement",
      description: "Terms for using margin in your account (optional)."
    }
    // Removed crypto agreement as it's not supported in California
  ];

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!data.agreementsAccepted.customer) {
      newErrors.customer = "You must accept the Customer Agreement to continue";
    }
    
    if (!data.agreementsAccepted.account) {
      newErrors.account = "You must accept the Account Agreement to continue";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onContinue();
    }
  };

  const handleAgreementChange = (agreement: keyof typeof data.agreementsAccepted, checked: boolean) => {
    onUpdate({
      agreementsAccepted: {
        ...data.agreementsAccepted,
        [agreement]: checked
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-lg mx-auto">
      <h2 className="text-2xl font-bold mb-6">Agreements</h2>
      
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground mb-4">
          Please review and accept the following agreements to complete your account setup.
        </p>
        
        <div className="space-y-6">
          <div className="border rounded-md p-4 space-y-4">
            <h3 className="font-medium">Customer Agreement</h3>
            <p className="text-sm text-muted-foreground">
              This agreement governs the relationship between you and Alpaca Securities LLC. It outlines your rights, obligations, and the terms under which services will be provided.
            </p>
            <a 
              href="https://alpaca.markets/disclosures" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-sm text-primary underline block mt-2"
            >
              Read Customer Agreement
            </a>
            <div className="flex items-start space-x-3 mt-4">
              <Checkbox 
                id="customer-agreement"
                checked={data.agreementsAccepted.customer}
                onCheckedChange={(checked) => 
                  handleAgreementChange('customer', checked as boolean)
                }
              />
              <div>
                <Label 
                  htmlFor="customer-agreement"
                  className="cursor-pointer"
                >
                  I have read and agree to the Customer Agreement
                </Label>
                {errors.customer && <p className="text-red-500 text-sm mt-1">{errors.customer}</p>}
              </div>
            </div>
          </div>
          
          <div className="border rounded-md p-4 space-y-4">
            <h3 className="font-medium">Account Agreement</h3>
            <p className="text-sm text-muted-foreground">
              This agreement contains important information about your brokerage account, including information on handling of funds, securities, and other assets.
            </p>
            <a 
              href="https://alpaca.markets/disclosures" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-sm text-primary underline block mt-2"
            >
              Read Account Agreement
            </a>
            <div className="flex items-start space-x-3 mt-4">
              <Checkbox 
                id="account-agreement"
                checked={data.agreementsAccepted.account}
                onCheckedChange={(checked) => 
                  handleAgreementChange('account', checked as boolean)
                }
              />
              <div>
                <Label 
                  htmlFor="account-agreement"
                  className="cursor-pointer"
                >
                  I have read and agree to the Account Agreement
                </Label>
                {errors.account && <p className="text-red-500 text-sm mt-1">{errors.account}</p>}
              </div>
            </div>
          </div>
          
          <div className="border rounded-md p-4 space-y-4">
            <h3 className="font-medium">Margin Agreement (Optional)</h3>
            <p className="text-sm text-muted-foreground">
              This agreement allows you to borrow funds from Alpaca Securities LLC for the purpose of purchasing securities. Trading on margin involves additional risks.
            </p>
            <a 
              href="https://alpaca.markets/disclosures" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-sm text-primary underline block mt-2"
            >
              Read Margin Agreement
            </a>
            <div className="flex items-start space-x-3 mt-4">
              <Checkbox 
                id="margin-agreement"
                checked={data.agreementsAccepted.margin}
                onCheckedChange={(checked) => 
                  handleAgreementChange('margin', checked as boolean)
                }
              />
              <div>
                <Label 
                  htmlFor="margin-agreement"
                  className="cursor-pointer"
                >
                  I have read and agree to the Margin Agreement (optional)
                </Label>
              </div>
            </div>
          </div>
          
          {/* Removed crypto agreement section as it's not supported in California */}
        </div>
      </div>

      <div className="flex gap-4">
        <Button 
          type="button" 
          variant="outline" 
          onClick={onBack} 
          className="flex-1"
        >
          Back
        </Button>
        <Button type="submit" className="flex-1">Continue</Button>
      </div>
    </form>
  );
} 