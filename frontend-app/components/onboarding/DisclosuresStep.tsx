"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { OnboardingData } from "./OnboardingTypes";

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
    <form onSubmit={handleSubmit} className="space-y-6 max-w-lg mx-auto">
      <h2 className="text-2xl font-bold mb-6">Disclosures</h2>
      
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground mb-4">
          Please answer the following questions accurately. These disclosures are required by regulatory authorities.
        </p>
        
        {disclosures.map((disclosure) => (
          <div key={disclosure.id} className="space-y-2 border-b pb-4">
            <div className="flex items-start space-x-3">
              <Checkbox 
                id={disclosure.id}
                checked={data[disclosure.field as keyof OnboardingData] as boolean}
                onCheckedChange={(checked) => 
                  onUpdate({ [disclosure.field]: checked })
                }
              />
              <div>
                <Label 
                  htmlFor={disclosure.id}
                  className="font-medium cursor-pointer"
                >
                  {disclosure.label}
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {disclosure.description}
                </p>
              </div>
            </div>
          </div>
        ))}
        
        <div className="pt-4">
          <p className="text-sm text-muted-foreground">
            If you answered "Yes" to any of the above questions, additional information may be required before your account can be approved.
          </p>
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