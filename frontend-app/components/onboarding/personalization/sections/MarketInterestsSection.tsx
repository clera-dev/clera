"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { 
  MarketInterest, 
  MARKET_INTEREST_DESCRIPTIONS 
} from "@/lib/types/personalization";

interface MarketInterestsSectionProps {
  selectedInterests: MarketInterest[];
  onChange: (interests: MarketInterest[]) => void;
  error?: string;
  onClearError?: () => void;
}

/**
 * Market interests selector section for personalization form
 * Multiple selection up to 5 interests, minimum 1 required
 */
export function MarketInterestsSection({ 
  selectedInterests, 
  onChange, 
  error, 
  onClearError 
}: MarketInterestsSectionProps) {
  const maxSelections = 5;

  const handleInterestToggle = (interest: MarketInterest) => {
    const isSelected = selectedInterests.includes(interest);
    let newInterests: MarketInterest[];

    if (isSelected) {
      // Remove interest
      newInterests = selectedInterests.filter(i => i !== interest);
    } else {
      // Add interest if under limit
      if (selectedInterests.length < maxSelections) {
        newInterests = [...selectedInterests, interest];
      } else {
        // Don't add if at limit
        return;
      }
    }
    
    // Clear error when user makes a selection
    if (onClearError && newInterests.length > 0) {
      onClearError();
    }
    
    onChange(newInterests);
  };

  const canSelectMore = selectedInterests.length < maxSelections;

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">
          What kind of market news interests you?
        </h2>
        <p className="text-gray-600 mb-1">
          What kind of investments or industries are you interested in?
        </p>
        <p className="text-sm text-gray-500">
          Select up to {maxSelections} ({selectedInterests.length}/{maxSelections} selected)
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Object.entries(MARKET_INTEREST_DESCRIPTIONS).map(([key, description]) => {
          const interest = key as MarketInterest;
          const isSelected = selectedInterests.includes(interest);
          const canClick = isSelected || canSelectMore;
          
          return (
            <Card
              key={interest}
              className={cn(
                "transition-all duration-200",
                canClick && "cursor-pointer hover:shadow-md",
                !canClick && "opacity-50 cursor-not-allowed",
                isSelected && "ring-2 ring-primary border-primary",
                error && !isSelected && "border-red-200"
              )}
              onClick={canClick ? () => handleInterestToggle(interest) : undefined}
            >
              <CardContent className="p-4 text-center relative">
                {isSelected && (
                  <div className="absolute top-2 right-2">
                    <Check className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div className="font-medium text-gray-900 text-sm">
                  {description}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {error && (
        <div className="text-center">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {selectedInterests.length === 0 && (
        <div className="text-center">
          <p className="text-sm text-gray-500">
            Please select at least one area of interest
          </p>
        </div>
      )}
    </div>
  );
}
