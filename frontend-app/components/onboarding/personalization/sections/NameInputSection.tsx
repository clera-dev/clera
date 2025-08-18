"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface NameInputSectionProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  onClearError?: () => void;
}

/**
 * Name input section component for personalization form
 * Handles first name input with real-time validation
 */
export function NameInputSection({ 
  value, 
  onChange, 
  error, 
  onClearError 
}: NameInputSectionProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;

    // Unicode-safe sanitization: allow letters (Unicode), spaces, apostrophes, and hyphens
    // Avoid RegExp Unicode flag by using letter detection via case change
    const normalized = newValue.normalize('NFKC');
    let sanitizedValue = '';
    for (const ch of normalized) {
      const lower = ch.toLowerCase();
      const upper = ch.toUpperCase();
      const isLetter = lower !== upper;
      if (isLetter || ch === ' ' || ch === '-' || ch === "'") {
        sanitizedValue += ch;
      }
    }
    sanitizedValue = sanitizedValue.replace(/\s+/g, ' ').substring(0, 50);

    // Clear error when user starts typing valid input
    if (onClearError && sanitizedValue !== value && sanitizedValue.length > 0) {
      onClearError();
    }

    onChange(sanitizedValue);
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">
          What is your name?
        </h2>
        <p className="text-gray-600">
          Let's start with something simple - what should I call you?
        </p>
      </div>
      
      <div className="max-w-md mx-auto">
        <Label htmlFor="firstName" className="text-sm font-medium text-gray-700">
          First name
        </Label>
        <Input
          id="firstName"
          type="text"
          value={value}
          onChange={handleChange}
          placeholder="Enter your first name"
          className={cn(
            "mt-1",
            error && "border-red-300 focus:border-red-500 focus:ring-red-500"
          )}
        />
        {error && (
          <p className="mt-1 text-sm text-red-600">{error}</p>
        )}
        <p className="mt-1 text-xs text-gray-500">
          Letters (including accents), spaces, apostrophes, and hyphens only
        </p>
      </div>
    </div>
  );
}
