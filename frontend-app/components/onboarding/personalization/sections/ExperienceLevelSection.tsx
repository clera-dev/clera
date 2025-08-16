"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { 
  ExperienceLevel, 
  EXPERIENCE_LEVEL_DESCRIPTIONS 
} from "@/lib/types/personalization";

interface ExperienceLevelSectionProps {
  selectedLevel: ExperienceLevel | '';
  onChange: (level: ExperienceLevel) => void;
  error?: string;
  onClearError?: () => void;
}

/**
 * Experience level selector section for personalization form
 * Single selection of investment experience level
 */
export function ExperienceLevelSection({ 
  selectedLevel, 
  onChange, 
  error, 
  onClearError 
}: ExperienceLevelSectionProps) {
  const handleLevelSelect = (level: ExperienceLevel) => {
    // Clear error when user makes a selection
    if (onClearError) {
      onClearError();
    }
    
    onChange(level);
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">
          How familiar are you with investing and financial markets?
        </h2>
        <p className="text-gray-600">
          This helps me tailor my advice to your knowledge level
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
        {Object.entries(EXPERIENCE_LEVEL_DESCRIPTIONS).map(([key, description]) => {
          const level = key as ExperienceLevel;
          const isSelected = selectedLevel === level;
          
          return (
            <Card
              key={level}
              className={cn(
                "cursor-pointer transition-all duration-200 hover:shadow-md",
                isSelected && "ring-2 ring-primary border-primary",
                error && !isSelected && "border-red-200"
              )}
              onClick={() => handleLevelSelect(level)}
            >
              <CardContent className="p-6 relative">
                <div className="text-center">
                  <div className="font-medium text-gray-900 mb-2">
                    {description}
                  </div>
                  <div className="text-sm text-gray-600 capitalize">
                    {level.replace('_', ' ')} level
                  </div>
                </div>
                {isSelected && (
                  <div className="absolute top-2 right-2">
                    <Check className="h-5 w-5 text-primary" />
                  </div>
                )}
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
    </div>
  );
}
