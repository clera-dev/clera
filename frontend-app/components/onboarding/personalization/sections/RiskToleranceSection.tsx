"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Check, Shield, Scale, TrendingUp, Info } from "lucide-react";
import { 
  RiskTolerance
} from "@/lib/types/personalization";

interface RiskToleranceSectionProps {
  selectedRisk: RiskTolerance | '';
  onChange: (risk: RiskTolerance) => void;
  error?: string;
  onClearError?: () => void;
}

// Clearer, more intuitive risk options with better descriptions
const RISK_OPTIONS = {
  [RiskTolerance.CONSERVATIVE]: {
    title: "Play it safe",
    description: "I prefer stability over big gains. Protecting what I have is most important.",
    icon: Shield,
    detail: "Lower risk, steadier returns"
  },
  [RiskTolerance.MODERATE]: {
    title: "Balance growth and safety",
    description: "I'm okay with some ups and downs if it means better long-term growth.",
    icon: Scale,
    detail: "Mix of growth and stability"
  },
  [RiskTolerance.AGGRESSIVE]: {
    title: "Go for growth",
    description: "I can handle market swings. I'm investing for the long haul.",
    icon: TrendingUp,
    detail: "Higher potential, more volatility"
  }
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
          How do you feel about investment risk?
        </h2>
        <p className="text-gray-300 text-base mb-4">
          This helps me recommend investments that match your comfort level
        </p>
        
        {/* Why we ask context box */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20 text-sm text-gray-300">
          <Info className="h-4 w-4 text-primary" />
          <span>This will help me recommend the right investment strategies for you</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 max-w-2xl mx-auto px-4 sm:px-0">
        {Object.entries(RISK_OPTIONS).map(([key, option]) => {
          const risk = key as RiskTolerance;
          const isSelected = selectedRisk === risk;
          const IconComponent = option.icon;
          
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
                  <div className="flex-shrink-0 mt-1">
                    <div className={cn(
                      "h-12 w-12 rounded-full flex items-center justify-center",
                      isSelected ? "bg-primary/20" : "bg-gray-800"
                    )}>
                      <IconComponent className={cn(
                        "h-6 w-6",
                        isSelected ? "text-primary" : "text-gray-400"
                      )} />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-white text-lg mb-1">
                      {option.title}
                    </div>
                    <div className="text-gray-300 mb-2">
                      {option.description}
                    </div>
                    <div className="text-sm text-gray-500">
                      {option.detail}
                    </div>
                  </div>
                  {isSelected && (
                    <div className="flex-shrink-0">
                      <Check className="h-5 w-5 text-primary" />
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
