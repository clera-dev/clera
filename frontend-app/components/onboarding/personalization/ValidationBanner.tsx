"use client";

import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ValidationBannerProps {
  missingFields: string[];
  onDismiss: () => void;
  className?: string;
}

const FIELD_DISPLAY_NAMES: Record<string, string> = {
  firstName: 'Name',
  investmentGoals: 'Investment goals',
  riskTolerance: 'Risk tolerance',
  investmentTimeline: 'Investment timeline',
  experienceLevel: 'Experience level',
  monthlyInvestmentGoal: 'Monthly goal',
  marketInterests: 'Market interests',
};

/**
 * Validation banner component
 * Shows missing required fields in a compact, dismissible banner
 */
export function ValidationBanner({
  missingFields,
  onDismiss,
  className
}: ValidationBannerProps) {
  if (missingFields.length === 0) {
    return null;
  }

  const displayNames = missingFields.map(
    field => FIELD_DISPLAY_NAMES[field] || field
  );

  return (
    <div className={cn(
      "bg-red-50 border border-red-200 rounded-lg p-4 mb-6",
      className
    )}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
        
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-red-800 mb-1">
            Please complete the following sections:
          </p>
          <p className="text-sm text-red-700">
            {displayNames.join(', ')}
          </p>
        </div>

        <button
          onClick={onDismiss}
          className="flex-shrink-0 text-red-400 hover:text-red-600 transition-colors"
          aria-label="Dismiss banner"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
