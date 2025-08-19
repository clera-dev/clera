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

    // Unicode-friendly sanitization: normalize, strip control/digits/emojis, allow spaces, hyphens, apostrophes
    const normalized = newValue.normalize('NFKC');
    let sanitizedValue = normalized
      .replace(/[\u0000-\u001F\u007F]/g, '')
      .replace(/[\uD800-\uDFFF]/g, '')
      .replace(/[0-9]/g, '')
      .replace(/["`^~_|<>\\{}\[\]@#$%&*=+:;.,!?]/g, '');

    sanitizedValue = sanitizedValue.replace(/\s+/g, ' ').trim().substring(0, 50);

    // Clear error when user starts typing valid input
    if (onClearError && sanitizedValue !== value && sanitizedValue.length > 0) {
      onClearError();
    }

    onChange(sanitizedValue);
  };

  return (
    <div className="space-y-6 px-2 sm:px-0">
      <div className="text-center px-4 sm:px-0">
        <h2 className="text-2xl font-semibold text-white mb-3">
          What is your name?
        </h2>
        <p className="text-white text-base">
          Let's start with something simple - what should I call you?
        </p>
      </div>
      
      <div className="max-w-md mx-auto px-4 sm:px-0">
        <Label htmlFor="firstName" className="text-sm font-medium text-white mb-2 block">
          First name
        </Label>
        <Input
          id="firstName"
          type="text"
          value={value}
          onChange={handleChange}
          placeholder="Enter your first name"
          className={cn(
            "mt-1 h-12",
            error && "border-red-300 focus:border-red-500 focus:ring-red-500"
          )}
        />
        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}
        <p className="mt-2 text-xs text-gray-500 leading-relaxed">
          Letters (including accents), spaces, apostrophes, and hyphens only
        </p>
      </div>
    </div>
  );
}
