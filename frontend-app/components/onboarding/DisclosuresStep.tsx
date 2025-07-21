"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { OnboardingData } from "@/lib/types/onboarding";

interface DisclosuresStepProps {
  data: OnboardingData;
  onUpdate: (data: Partial<OnboardingData>) => void;
  onContinue: () => void;
  onBack: () => void;
}

export default function DisclosuresStep({
  data,
  onUpdate,
  onContinue,
  onBack
}: DisclosuresStepProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onContinue();
  };

  const disclosures = [
    {
      id: "isControlPerson",
      field: "isControlPerson",
      label: "Are you a control person of a publicly traded company?",
      description: "A control person is a director, officer, or someone who owns 10% or more of a class of a company's securities."
    },
    {
      id: "isAffiliatedExchangeOrFinra",
      field: "isAffiliatedExchangeOrFinra",
      label: "Are you affiliated with or employed by a stock exchange or FINRA?",
      description: "This includes employment by a broker-dealer or other FINRA member firm."
    },
    {
      id: "isPoliticallyExposed",
      field: "isPoliticallyExposed",
      label: "Are you a politically exposed person (PEP)?",
      description: "A politically exposed person is someone who has been entrusted with a prominent public function, such as heads of state, senior politicians, senior government officials, judicial or military officials, senior executives of state-owned corporations, and important political party officials."
    },
    {
      id: "immediateFamilyExposed",
      field: "immediateFamilyExposed",
      label: "Is an immediate family member a politically exposed person?",
      description: "Immediate family members include parents, siblings, spouse, children, and in-laws."
    }
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto p-8">
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-3 bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">Disclosures</h2>
        <p className="text-muted-foreground">
          Please answer the following questions accurately. These disclosures are required by regulatory authorities.
        </p>
      </div>
      
      <div className="space-y-8 bg-card/50 p-6 rounded-lg border border-border/30 shadow-sm">
        {disclosures.map((disclosure) => (
          <div key={disclosure.id} className="space-y-4 border-b border-border/30 pb-6">
            <div className="space-y-2">
              <Label 
                htmlFor={disclosure.id}
                className="font-medium text-base"
              >
                {disclosure.label}
              </Label>
              <p className="text-sm text-muted-foreground">
                {disclosure.description}
              </p>
            </div>
            
            <div className="flex gap-3" id={disclosure.id}>
              <Button
                type="button"
                variant={data[disclosure.field as keyof OnboardingData] ? "default" : "outline"}
                size="sm"
                onClick={() => onUpdate({ [disclosure.field]: true })}
                className={`px-6 py-1 ${data[disclosure.field as keyof OnboardingData] ? "bg-primary/90 hover:bg-primary" : ""}`}
              >
                Yes
              </Button>
              <Button
                type="button"
                variant={!data[disclosure.field as keyof OnboardingData] ? "default" : "outline"}
                size="sm"
                onClick={() => onUpdate({ [disclosure.field]: false })}
                className={`px-6 py-1 ${!data[disclosure.field as keyof OnboardingData] ? "bg-primary/90 hover:bg-primary" : ""}`}
              >
                No
              </Button>
            </div>
          </div>
        ))}
        
        <div className="pt-2">
          <p className="text-sm text-muted-foreground">
            If you answered "Yes" to any of the above questions, additional information may be required before your account can be approved.
          </p>
        </div>
      </div>

      <div className="flex gap-4 pt-4">
        <Button 
          type="button" 
          variant="outline" 
          onClick={onBack} 
          className="px-6 py-2"
        >
          Back
        </Button>
        <Button 
          type="submit" 
          className="px-8 py-2 ml-auto bg-gradient-to-r from-primary to-blue-600 hover:shadow-lg transition-all"
        >
          Continue
        </Button>
      </div>
    </form>
  );
} 