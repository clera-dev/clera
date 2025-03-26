"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { OnboardingData, FundingSource } from "./OnboardingTypes";

interface PersonalInfoStepProps {
  data: OnboardingData;
  onUpdate: (data: Partial<OnboardingData>) => void;
  onContinue: () => void;
  onBack: () => void;
}

export default function PersonalInfoStep({ 
  data, 
  onUpdate, 
  onContinue, 
  onBack 
}: PersonalInfoStepProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});

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
          <div>
            <Label htmlFor="firstName">First Name</Label>
            <Input
              id="firstName"
              value={data.firstName}
              onChange={(e) => onUpdate({ firstName: e.target.value })}
              className={errors.firstName ? "border-red-500" : ""}
            />
            {errors.firstName && <p className="text-red-500 text-sm mt-1">{errors.firstName}</p>}
          </div>
          
          <div>
            <Label htmlFor="middleName">Middle Name (Optional)</Label>
            <Input
              id="middleName"
              value={data.middleName}
              onChange={(e) => onUpdate({ middleName: e.target.value })}
            />
          </div>
          
          <div>
            <Label htmlFor="lastName">Last Name</Label>
            <Input
              id="lastName"
              value={data.lastName}
              onChange={(e) => onUpdate({ lastName: e.target.value })}
              className={errors.lastName ? "border-red-500" : ""}
            />
            {errors.lastName && <p className="text-red-500 text-sm mt-1">{errors.lastName}</p>}
          </div>
        </div>

        <div>
          <Label htmlFor="dateOfBirth">Date of Birth</Label>
          <Input
            id="dateOfBirth"
            type="date"
            value={data.dateOfBirth}
            onChange={(e) => onUpdate({ dateOfBirth: e.target.value })}
            className={errors.dateOfBirth ? "border-red-500" : ""}
          />
          {errors.dateOfBirth && <p className="text-red-500 text-sm mt-1">{errors.dateOfBirth}</p>}
        </div>

        <div>
          <Label htmlFor="taxId">Social Security Number (SSN)</Label>
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

        <div>
          <Label className="mb-2 block">Funding Sources (select all that apply)</Label>
          <div className="space-y-2">
            {Object.values(FundingSource).map((source) => (
              <div key={source} className="flex items-center space-x-2">
                <Checkbox 
                  id={`source-${source}`}
                  checked={data.fundingSource.includes(source)}
                  onCheckedChange={(checked) => 
                    handleFundingSourceChange(source, checked as boolean)
                  }
                />
                <Label 
                  htmlFor={`source-${source}`}
                  className="font-normal cursor-pointer"
                >
                  {source.split('_').map(word => 
                    word.charAt(0).toUpperCase() + word.slice(1)
                  ).join(' ')}
                </Label>
              </div>
            ))}
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