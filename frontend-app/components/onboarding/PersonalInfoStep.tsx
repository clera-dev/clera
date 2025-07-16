"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { OnboardingData, FundingSource } from "./OnboardingTypes";
import { InfoIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PersonalInfoStepProps {
  data: OnboardingData;
  onUpdate: (data: Partial<OnboardingData>) => void;
  onContinue: () => void;
  onBack: () => void;
}

// Descriptions for each funding source
const fundingSourceDescriptions: Record<FundingSource, string> = {
  [FundingSource.EMPLOYMENT_INCOME]: "Money earned from your job, salary, wages, or employment compensation",
  [FundingSource.INVESTMENTS]: "Money from stocks, bonds, mutual funds, or other financial investment returns",
  [FundingSource.INHERITANCE]: "Money or assets received from someone who has passed away",
  [FundingSource.BUSINESS_INCOME]: "Money earned from a business you own or operate, including self-employment income",
  [FundingSource.SAVINGS]: "Money accumulated from past income that has been set aside",
  [FundingSource.FAMILY]: "Money received as a gift or support from family members",
};

export default function PersonalInfoStep({ 
  data, 
  onUpdate, 
  onContinue, 
  onBack 
}: PersonalInfoStepProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [openTooltip, setOpenTooltip] = useState<FundingSource | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Detect screen size for responsive tooltip positioning
  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768); // Tailwind's md breakpoint
    };

    // Check on mount
    checkScreenSize();

    // Listen for resize events
    window.addEventListener('resize', checkScreenSize);

    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Close tooltip when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      
      // Check if the click is on a tooltip trigger button or inside a tooltip
      const isTooltipTrigger = target.closest('[data-tooltip-trigger]');
      const isTooltipContent = target.closest('[data-radix-tooltip-content]');
      
      // If click is outside both the trigger and content, close the tooltip
      if (!isTooltipTrigger && !isTooltipContent && openTooltip) {
        setOpenTooltip(null);
      }
    };

    // Only add listener if a tooltip is open
    if (openTooltip) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    // Cleanup
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openTooltip]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!data.firstName) newErrors.firstName = "First name is required";
    if (!data.lastName) newErrors.lastName = "Last name is required";
    
    if (data.middleName && data.middleName.length > 50) {
      newErrors.middleName = "Middle name is too long (maximum 50 characters)";
    }
    
    if (!data.dateOfBirth) newErrors.dateOfBirth = "Date of birth is required";
    else {
      // Check if user is at least 18 years old
      const dob = new Date(data.dateOfBirth);
      const today = new Date();
      const age = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
        if (age - 1 < 18) newErrors.dateOfBirth = "You must be at least 18 years old";
      } else if (age < 18) {
        newErrors.dateOfBirth = "You must be at least 18 years old";
      }
    }
    
    if (!data.taxId) newErrors.taxId = "Tax ID (SSN) is required";
    else if (!/^\d{3}-\d{2}-\d{4}$/.test(data.taxId)) {
      newErrors.taxId = "Please enter a valid SSN (e.g., 123-45-6789)";
    }
    
    if (data.fundingSource.length === 0) {
      newErrors.fundingSource = "Please select at least one funding source";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onContinue();
    }
  };

  const handleFundingSourceChange = (source: FundingSource, checked: boolean) => {
    let updatedSources = [...data.fundingSource];
    
    if (checked) {
      if (!updatedSources.includes(source)) {
        updatedSources.push(source);
      }
    } else {
      updatedSources = updatedSources.filter(s => s !== source);
    }
    
    onUpdate({ fundingSource: updatedSources });
  };

  const handleTooltipToggle = (source: FundingSource) => {
    setOpenTooltip(openTooltip === source ? null : source);
  };

  const formatSSN = (value: string) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, '');
    
    // Format as XXX-XX-XXXX
    if (digits.length <= 3) {
      return digits;
    } else if (digits.length <= 5) {
      return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    } else {
      return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 9)}`;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-lg mx-auto">
      <h2 className="text-2xl font-bold mb-6">Personal Information</h2>
      
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="grid grid-rows-[auto_1fr] gap-1">
            <Label htmlFor="firstName" className="text-sm font-medium min-h-[2.5rem] flex items-end">First Name</Label>
            <Input
              id="firstName"
              value={data.firstName}
              onChange={(e) => onUpdate({ firstName: e.target.value })}
              className={errors.firstName ? "border-red-500" : ""}
            />
            {errors.firstName && <p className="text-red-500 text-sm mt-1">{errors.firstName}</p>}
          </div>
          
          <div className="grid grid-rows-[auto_1fr] gap-1">
            <Label htmlFor="middleName" className="text-sm font-medium min-h-[2.5rem] flex items-end">Middle Name (Optional)</Label>
            <Input
              id="middleName"
              value={data.middleName}
              onChange={(e) => onUpdate({ middleName: e.target.value })}
            />
          </div>
          
          <div className="grid grid-rows-[auto_1fr] gap-1">
            <Label htmlFor="lastName" className="text-sm font-medium min-h-[2.5rem] flex items-end">Last Name</Label>
            <Input
              id="lastName"
              value={data.lastName}
              onChange={(e) => onUpdate({ lastName: e.target.value })}
              className={errors.lastName ? "border-red-500" : ""}
            />
            {errors.lastName && <p className="text-red-500 text-sm mt-1">{errors.lastName}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="grid grid-rows-[auto_1fr] gap-1">
            <Label htmlFor="dateOfBirth" className="text-sm font-medium min-h-[2.5rem] flex items-end">Date of Birth</Label>
            <Input
              id="dateOfBirth"
              type="date"
              value={data.dateOfBirth}
              onChange={(e) => onUpdate({ dateOfBirth: e.target.value })}
              className={errors.dateOfBirth ? "border-red-500" : ""}
            />
            {errors.dateOfBirth && <p className="text-red-500 text-sm mt-1">{errors.dateOfBirth}</p>}
          </div>

          <div className="grid grid-rows-[auto_1fr] gap-1">
            <Label htmlFor="taxId" className="text-sm font-medium min-h-[2.5rem] flex items-end">Social Security Number (SSN)</Label>
            <Input
              id="taxId"
              value={data.taxId}
              onChange={(e) => onUpdate({ taxId: formatSSN(e.target.value) })}
              className={errors.taxId ? "border-red-500" : ""}
              maxLength={11}
              placeholder="123-45-6789"
            />
            {errors.taxId && <p className="text-red-500 text-sm mt-1">{errors.taxId}</p>}
          </div>
        </div>

        <div>
          <div className="flex items-center mb-2">
            <Label>Funding Sources (select all that apply)</Label>
          </div>
          <div className="space-y-2">
            <TooltipProvider>
              {Object.values(FundingSource).map((source) => (
                <div key={source} className="flex items-center space-x-2">
                  <Checkbox 
                    id={`source-${source}`}
                    checked={data.fundingSource.includes(source)}
                    onCheckedChange={(checked) => 
                      handleFundingSourceChange(source, checked as boolean)
                    }
                  />
                  <div className="flex items-center space-x-1">
                    <Label 
                      htmlFor={`source-${source}`}
                      className="font-normal cursor-pointer"
                    >
                      {source.split('_').map(word => 
                        word.charAt(0).toUpperCase() + word.slice(1)
                      ).join(' ')}
                    </Label>
                    <Tooltip open={openTooltip === source} onOpenChange={() => {}}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="cursor-help p-1 hover:bg-muted rounded-sm transition-colors ml-1"
                          onClick={() => handleTooltipToggle(source)}
                          data-tooltip-trigger
                          aria-label={`Information about ${source.split('_').map(word => 
                            word.charAt(0).toUpperCase() + word.slice(1)
                          ).join(' ')}`}
                        >
                          <InfoIcon 
                            className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" 
                          />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent 
                        side={isMobile ? "top" : "right"}
                        className={isMobile 
                          ? "max-w-[280px] text-xs z-50" 
                          : "max-w-[320px] text-sm z-50"
                        }
                        sideOffset={8}
                      >
                        <p>{fundingSourceDescriptions[source]}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              ))}
            </TooltipProvider>
          </div>
          {errors.fundingSource && (
            <p className="text-red-500 text-sm mt-1">{errors.fundingSource}</p>
          )}
        </div>
      </div>

      <div className="flex gap-4">
        <Button 
          type="button" 
          variant="outline" 
          onClick={onBack} 
          className="flex-1"
        >
          Back
        </Button>
        <Button type="submit" className="flex-1">Continue</Button>
      </div>
    </form>
  );
} 