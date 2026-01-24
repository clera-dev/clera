"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Check, Info } from "lucide-react";
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
        <h2 className="text-2xl font-semibold text-white mb-2">
          What's your investing experience?
        </h2>
        <p className="text-gray-300 mb-4">
          No wrong answers here — this just helps me explain things at the right level
        </p>
        
        {/* Why we ask context box */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20 text-sm text-gray-300">
          <Info className="h-4 w-4 text-primary" />
          <span>I'll adjust how I explain concepts and recommendations based on your background</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
        {Object.entries(EXPERIENCE_LEVEL_DESCRIPTIONS).map(([key, description]) => {
          const level = key as ExperienceLevel;
          const isSelected = selectedLevel === level;
          
          return (
            <Card
              key={level}
              className={cn(
                "cursor-pointer transition-all duration-200 hover:shadow-md bg-black border-gray-600",
                isSelected && "ring-2 ring-primary border-primary bg-black",
                error && !isSelected && "border-red-400"
              )}
              onClick={() => handleLevelSelect(level)}
            >
              <CardContent className="p-6 relative">
                <div className="text-center">
                  <div className="font-bold text-white mb-2">
                    {description}
                  </div>
                  <div className="text-sm text-gray-300 capitalize font-medium">
                    {level.replace('_', ' ')} level
                  </div>
                </div>
                {isSelected && (
                  <div className="absolute top-2 right-2">
                    <Check className="h-5 w-5 text-white" />
                  </div>
                )}
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
