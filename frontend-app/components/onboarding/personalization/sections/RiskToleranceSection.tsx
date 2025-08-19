"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Check, Shield, Smile, Rocket } from "lucide-react";
import { 
  RiskTolerance, 
  RISK_TOLERANCE_DESCRIPTIONS 
} from "@/lib/types/personalization";

interface RiskToleranceSectionProps {
  selectedRisk: RiskTolerance | '';
  onChange: (risk: RiskTolerance) => void;
  error?: string;
  onClearError?: () => void;
}

const RISK_ICONS = {
  conservative: Shield,
  moderate: Smile,
  aggressive: Rocket,
} as const;

/**
 * Risk tolerance selector section for personalization form
 * Single selection of risk tolerance level
 */
export function RiskToleranceSection({ 
  selectedRisk, 
  onChange, 
  error, 
  onClearError 
}: RiskToleranceSectionProps) {
  const handleRiskSelect = (risk: RiskTolerance) => {
    // Clear error when user makes a selection
    if (onClearError) {
      onClearError();
    }
    
    onChange(risk);
  };

  return (
    <div className="space-y-6 px-2 sm:px-0">
      <div className="text-center px-4 sm:px-0">
        <h2 className="text-2xl font-semibold text-white mb-3">
          Imagine your portfolio drops by 20% in a single month
        </h2>
        <p className="text-white text-base">
          Which best describes your reaction?
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 max-w-2xl mx-auto px-4 sm:px-0">
        {Object.entries(RISK_TOLERANCE_DESCRIPTIONS).map(([key, description]) => {
          const risk = key as RiskTolerance;
          const isSelected = selectedRisk === risk;
          const IconComponent = RISK_ICONS[risk];
          
          return (
            <Card
              key={risk}
              className={cn(
                "cursor-pointer transition-all duration-200 hover:shadow-md bg-black border-gray-600",
                isSelected && "ring-2 ring-primary border-primary bg-black",
                error && !isSelected && "border-red-400"
              )}
              onClick={() => handleRiskSelect(risk)}
            >
              <CardContent className="p-6 relative">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    <IconComponent className="h-8 w-8 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-white mb-2">
                      {description}
                    </div>
                    <div className="text-sm text-gray-300 capitalize font-medium">
                      {risk.charAt(0).toUpperCase() + risk.slice(1)} approach
                    </div>
                  </div>
                  {isSelected && (
                    <div className="flex-shrink-0">
                      <Check className="h-5 w-5 text-white" />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {error && (
        <div className="text-center px-4 sm:px-0">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
    </div>
  );
}
