"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavigationControllerProps {
  currentStep: number;
  totalSteps: number;
  onNext: () => void;
  onPrevious: () => void;
  onComplete: () => void;
  isSubmitting?: boolean;
  canProceed?: boolean;
  className?: string;
}

/**
 * Navigation controller for step-by-step personalization flow
 * Handles navigation between steps on both mobile and desktop
 */
export function NavigationController({
  currentStep,
  totalSteps,
  onNext,
  onPrevious,
  onComplete,
  isSubmitting = false,
  canProceed = true,
  className
}: NavigationControllerProps) {
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
    } else {
      onNext();
    }
  };

  return (
    <div className={cn("flex items-center justify-between gap-4 px-4 sm:px-0", className)}>
      {/* Back button */}
      <Button
        type="button"
        variant="outline"
        onClick={onPrevious}
        disabled={isFirstStep || isSubmitting}
        className="flex items-center gap-2 min-w-[80px]"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </Button>

      {/* Step indicator */}
      <div className="flex-1 text-center">
        <span className="text-sm text-gray-400">
          {currentStep + 1} of {totalSteps}
        </span>
      </div>

      {/* Next/Complete button */}
      <Button
        type="button"
        onClick={handleNext}
        disabled={isSubmitting || !canProceed}
        className={cn(
          "flex items-center gap-2 min-w-[100px]",
          isLastStep && "bg-gradient-to-r from-primary to-blue-600 hover:shadow-lg"
        )}
      >
        {isSubmitting ? (
          'Saving...'
        ) : isLastStep ? (
          'Complete'
        ) : (
          <>
            Continue
            <ChevronRight className="h-4 w-4" />
          </>
        )}
      </Button>
    </div>
  );
}
