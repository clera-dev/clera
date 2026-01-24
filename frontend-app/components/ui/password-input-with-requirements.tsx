"use client";

import * as React from "react";
import { EyeIcon, EyeOffIcon, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface PasswordRequirement {
  label: string;
  test: (password: string) => boolean;
}

const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  {
    label: "At least 8 characters",
    test: (password) => password.length >= 8,
  },
  {
    label: "Contains a number",
    test: (password) => /\d/.test(password),
  },
  {
    label: "Contains a lowercase letter",
    test: (password) => /[a-z]/.test(password),
  },
  {
    label: "Contains an uppercase letter",
    test: (password) => /[A-Z]/.test(password),
  },
];

export interface PasswordInputWithRequirementsProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  showRequirements?: boolean;
}

const PasswordInputWithRequirements = React.forwardRef<
  HTMLInputElement,
  PasswordInputWithRequirementsProps
>(({ className, showRequirements = true, onChange, ...props }, ref) => {
  const [showPassword, setShowPassword] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [isFocused, setIsFocused] = React.useState(false);
  const [hasInteracted, setHasInteracted] = React.useState(false);

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    setHasInteracted(true);
    onChange?.(e);
  };

  const allRequirementsMet = PASSWORD_REQUIREMENTS.every((req) =>
    req.test(password)
  );

  // Show requirements when focused or when there's a password entered
  const shouldShowRequirements =
    showRequirements && (isFocused || (hasInteracted && password.length > 0));

  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          type={showPassword ? "text" : "password"}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 pr-10",
            hasInteracted && !allRequirementsMet && password.length > 0
              ? "border-amber-500/50 focus-visible:ring-amber-500/50"
              : "",
            hasInteracted && allRequirementsMet && password.length > 0
              ? "border-green-500/50 focus-visible:ring-green-500/50"
              : "",
            className
          )}
          ref={ref}
          onChange={handleChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...props}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
          onClick={togglePasswordVisibility}
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? (
            <EyeOffIcon className="h-4 w-4 text-muted-foreground" />
          ) : (
            <EyeIcon className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </div>

      {/* Password requirements checklist */}
      {shouldShowRequirements && (
        <div className="rounded-lg bg-muted/50 p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Password requirements:
          </p>
          <ul className="space-y-1.5">
            {PASSWORD_REQUIREMENTS.map((requirement, index) => {
              const isMet = requirement.test(password);
              return (
                <li
                  key={index}
                  className={cn(
                    "flex items-center gap-2 text-xs transition-colors duration-200",
                    isMet ? "text-green-500" : "text-muted-foreground"
                  )}
                >
                  {isMet ? (
                    <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 flex-shrink-0 opacity-50" />
                  )}
                  <span>{requirement.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
});

PasswordInputWithRequirements.displayName = "PasswordInputWithRequirements";

export { PasswordInputWithRequirements, PASSWORD_REQUIREMENTS };
