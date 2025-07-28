"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
// import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OnboardingData, CitizenshipStatus, VisaType, VISA_TYPE_DESCRIPTIONS } from "@/lib/types/onboarding";
import { InfoIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { PIIFormField } from "@/components/account/PIIFormField";

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

    // Validate citizenship-related fields
    if (!data.citizenshipStatus) {
      newErrors.citizenshipStatus = "Please select your citizenship status";
    }

    // Validate permanent resident fields
    if (data.citizenshipStatus === CitizenshipStatus.PERMANENT_RESIDENT) {
      if (!data.countryOfBirth) newErrors.countryOfBirth = "Country of birth is required";
      else if (!/^[A-Z]{3}$/.test(data.countryOfBirth)) newErrors.countryOfBirth = "Must be a 3-letter ISO code";
      if (!data.countryOfCitizenship) newErrors.countryOfCitizenship = "Country of citizenship is required";
      else if (!/^[A-Z]{3}$/.test(data.countryOfCitizenship)) newErrors.countryOfCitizenship = "Must be a 3-letter ISO code";
    }

    // Validate visa holder fields
    if (data.citizenshipStatus === CitizenshipStatus.VISA_HOLDER) {
      if (!data.visaType) newErrors.visaType = "Visa type is required";
      if (!data.visaExpirationDate) {
        newErrors.visaExpirationDate = "Visa expiration date is required";
      } else {
        // Check if visa expiration is more than 90 days from now
        const expirationDate = new Date(data.visaExpirationDate);
        const today = new Date();
        const diffTime = expirationDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays < 90) {
          newErrors.visaExpirationDate = "Visa must be valid for at least 90 days";
        }
      }
      if (!data.countryOfBirth) newErrors.countryOfBirth = "Country of birth is required";
      else if (!/^[A-Z]{3}$/.test(data.countryOfBirth)) newErrors.countryOfBirth = "Must be a 3-letter ISO code";
      if (!data.countryOfCitizenship) newErrors.countryOfCitizenship = "Country of citizenship is required";
      else if (!/^[A-Z]{3}$/.test(data.countryOfCitizenship)) newErrors.countryOfCitizenship = "Must be a 3-letter ISO code";
      
      // Check if B1/B2 visa requires departure date
      if ((data.visaType === VisaType.B1 || data.visaType === VisaType.B2) && !data.dateOfDepartureFromUsa) {
        newErrors.dateOfDepartureFromUsa = "Date of departure from USA is required for B1/B2 visas";
      }
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

  const handleCountryCodeBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    const newErrors = { ...errors };

    if (value && !/^[A-Z]{3}$/.test(value)) {
      newErrors[id] = "Must be a 3-letter ISO code";
    } else {
      delete newErrors[id];
    }
    setErrors(newErrors);
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

  const handleCitizenshipChange = (value: CitizenshipStatus) => {
    onUpdate({ 
      citizenshipStatus: value,
      // Reset related fields when citizenship status changes
      permanentResident: value === CitizenshipStatus.PERMANENT_RESIDENT,
      visaType: undefined,
      visaExpirationDate: '',
      dateOfDepartureFromUsa: '',
      countryOfBirth: value === CitizenshipStatus.US_CITIZEN ? 'USA' : '',
      countryOfCitizenship: value === CitizenshipStatus.US_CITIZEN ? 'USA' : ''
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto p-4 sm:p-8">
      <div className="mb-6 sm:mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold mb-3 bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">Personal Information</h2>
        <p className="text-muted-foreground text-sm sm:text-base">Next, we'll need some personal details, which will be securely stored for regulatory purposes.</p>
      </div>
      
      <div className="space-y-6 bg-card/50 p-4 sm:p-6 rounded-lg border border-border/30 shadow-sm">
        {/* Name Fields - Stack vertically on mobile, 3 columns on desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName" className="text-sm font-medium">First Name</Label>
            <Input
              id="firstName"
              value={data.firstName}
              onChange={(e) => onUpdate({ firstName: e.target.value })}
              className={`${errors.firstName ? "border-red-500" : "border-border/40"} rounded-md h-12 sm:h-11`}
            />
            {errors.firstName && <p className="text-red-500 text-sm mt-1">{errors.firstName}</p>}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="middleName" className="text-sm font-medium">Middle Name (Optional)</Label>
            <Input
              id="middleName"
              value={data.middleName}
              onChange={(e) => onUpdate({ middleName: e.target.value })}
              className="border-border/40 rounded-md h-12 sm:h-11"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="lastName" className="text-sm font-medium">Last Name</Label>
            <Input
              id="lastName"
              value={data.lastName}
              onChange={(e) => onUpdate({ lastName: e.target.value })}
              className={`${errors.lastName ? "border-red-500" : "border-border/40"} rounded-md h-12 sm:h-11`}
            />
            {errors.lastName && <p className="text-red-500 text-sm mt-1">{errors.lastName}</p>}
          </div>
        </div>

        {/* Date of Birth and SSN - Stack vertically on mobile, 2 columns on desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-4">
          <div className="space-y-2">
            <Label htmlFor="dateOfBirth" className="text-sm font-medium">Date of Birth</Label>
            <Input
              id="dateOfBirth"
              type="date"
              value={data.dateOfBirth}
              onChange={(e) => onUpdate({ dateOfBirth: e.target.value })}
              className={`${errors.dateOfBirth ? "border-red-500" : "border-border/40"} rounded-md h-12 sm:h-11`}
            />
            {errors.dateOfBirth && <p className="text-red-500 text-sm mt-1">{errors.dateOfBirth}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="taxId" className="text-sm font-medium">Social Security Number (SSN)</Label>
            <Input
              id="taxId"
              type="text"
              inputMode="numeric"
              value={data.taxId}
              onChange={(e) => onUpdate({ taxId: formatSSN(e.target.value) })}
              className={`${errors.taxId ? "border-red-500" : "border-border/40"} rounded-md h-12 sm:h-11`}
              maxLength={11}
              placeholder="123-45-6789"
            />
            {errors.taxId && <p className="text-red-500 text-sm mt-1">{errors.taxId}</p>}
          </div>
        </div>

        {/* Country of Tax Residence - Full width */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium">Country of Tax Residence</Label>
            <InfoTooltip content="We are currently only available in the USA.">
              <button type="button" className="ml-2">
                <InfoIcon className="h-4 w-4 text-gray-400" />
              </button>
            </InfoTooltip>
          </div>
          <Input
            value={data.countryOfTaxResidence}
            disabled
            className="border-border/40 bg-muted/50 rounded-md h-12 sm:h-11"
          />
        </div>

        {/* Citizenship Section */}
        <div className="space-y-4">
          <Label className="text-sm font-medium">Are you a citizen of the United States?</Label>
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <input
                type="radio"
                id="us-citizen"
                name="citizenshipStatus"
                value={CitizenshipStatus.US_CITIZEN}
                checked={data.citizenshipStatus === CitizenshipStatus.US_CITIZEN}
                onChange={(e) => handleCitizenshipChange(e.target.value as CitizenshipStatus)}
                className="h-5 w-5 text-primary border-border/40 focus:ring-primary"
              />
              <Label htmlFor="us-citizen" className="font-normal cursor-pointer text-sm sm:text-base">Yes</Label>
            </div>
            <div className="flex items-center space-x-3">
              <input
                type="radio"
                id="permanent-resident"
                name="citizenshipStatus"
                value={CitizenshipStatus.PERMANENT_RESIDENT}
                checked={data.citizenshipStatus === CitizenshipStatus.PERMANENT_RESIDENT}
                onChange={(e) => handleCitizenshipChange(e.target.value as CitizenshipStatus)}
                className="h-5 w-5 text-primary border-border/40 focus:ring-primary"
              />
              <Label htmlFor="permanent-resident" className="font-normal cursor-pointer text-sm sm:text-base">No - Green Card / Permanent Resident</Label>
            </div>
            <div className="flex items-center space-x-3">
              <input
                type="radio"
                id="visa-holder"
                name="citizenshipStatus"
                value={CitizenshipStatus.VISA_HOLDER}
                checked={data.citizenshipStatus === CitizenshipStatus.VISA_HOLDER}
                onChange={(e) => handleCitizenshipChange(e.target.value as CitizenshipStatus)}
                className="h-5 w-5 text-primary border-border/40 focus:ring-primary"
              />
              <Label htmlFor="visa-holder" className="font-normal cursor-pointer text-sm sm:text-base">No - Visa</Label>
            </div>
          </div>
          {errors.citizenshipStatus && <p className="text-red-500 text-sm mt-1">{errors.citizenshipStatus}</p>}
        </div>

        {/* Conditional fields for non-US citizens */}
        {(data.citizenshipStatus === CitizenshipStatus.PERMANENT_RESIDENT || data.citizenshipStatus === CitizenshipStatus.VISA_HOLDER) && (
          <div className="space-y-4 border-t border-border/30 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="countryOfBirth" className="text-sm font-medium">Country of Birth</Label>
                <Input
                  id="countryOfBirth"
                  value={data.countryOfBirth}
                  onChange={(e) => onUpdate({ countryOfBirth: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })}
                  onBlur={handleCountryCodeBlur}
                  maxLength={3}
                  className={`${errors.countryOfBirth ? "border-red-500" : "border-border/40"} rounded-md h-12 sm:h-11`}
                  placeholder="3-letter ISO country code (e.g., CAN)"
                />
                {errors.countryOfBirth && <p className="text-red-500 text-sm mt-1">{errors.countryOfBirth}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="countryOfCitizenship" className="text-sm font-medium">Country of Citizenship</Label>
                <Input
                  id="countryOfCitizenship"
                  value={data.countryOfCitizenship}
                  onChange={(e) => onUpdate({ countryOfCitizenship: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })}
                  onBlur={handleCountryCodeBlur}
                  maxLength={3}
                  className={`${errors.countryOfCitizenship ? "border-red-500" : "border-border/40"} rounded-md h-12 sm:h-11`}
                  placeholder="3-letter ISO country code (e.g., CAN)"
                />
                {errors.countryOfCitizenship && <p className="text-red-500 text-sm mt-1">{errors.countryOfCitizenship}</p>}
              </div>
            </div>
          </div>
        )}

        {/* Visa-specific fields */}
        {data.citizenshipStatus === CitizenshipStatus.VISA_HOLDER && (
          <div className="space-y-4 border-t border-border/30 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="visaType" className="text-sm font-medium">Visa Type</Label>
                <Select value={data.visaType} onValueChange={(value: string) => onUpdate({ visaType: value as VisaType })}>
                  <SelectTrigger className={`mt-1 ${errors.visaType ? "border-red-500" : "border-border/40"} rounded-md h-11`}>
                    <SelectValue placeholder="Select visa type" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(VisaType).map((visa) => (
                      <SelectItem key={visa} value={visa}>
                        {VISA_TYPE_DESCRIPTIONS[visa]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.visaType && <p className="text-red-500 text-sm mt-1">{errors.visaType}</p>}
              </div>

              <div>
                <Label htmlFor="visaExpirationDate" className="text-sm font-medium">Visa Expiration Date</Label>
                <Input
                  id="visaExpirationDate"
                  type="date"
                  value={data.visaExpirationDate}
                  onChange={(e) => onUpdate({ visaExpirationDate: e.target.value })}
                  className={`mt-1 ${errors.visaExpirationDate ? "border-red-500" : "border-border/40"} rounded-md h-11`}
                />
                {errors.visaExpirationDate && <p className="text-red-500 text-sm mt-1">{errors.visaExpirationDate}</p>}
              </div>
            </div>

            {/* B1/B2 specific field */}
            {(data.visaType === VisaType.B1 || data.visaType === VisaType.B2) && (
              <div>
                <Label htmlFor="dateOfDepartureFromUsa" className="text-sm font-medium">Date of Departure from USA</Label>
                <Input
                  id="dateOfDepartureFromUsa"
                  type="date"
                  value={data.dateOfDepartureFromUsa}
                  onChange={(e) => onUpdate({ dateOfDepartureFromUsa: e.target.value })}
                  className={`mt-1 ${errors.dateOfDepartureFromUsa ? "border-red-500" : "border-border/40"} rounded-md h-11`}
                />
                {errors.dateOfDepartureFromUsa && <p className="text-red-500 text-sm mt-1">{errors.dateOfDepartureFromUsa}</p>}
                <p className="text-xs text-muted-foreground mt-1">Required for B1/B2 visa holders</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-4 pt-4">
        <Button 
          type="button" 
          variant="outline" 
          onClick={onBack} 
          className="px-6 py-2 border-border/40"
        >
          Back
        </Button>
        <Button 
          type="submit" 
          className="px-8 py-2 ml-auto bg-gradient-to-r from-primary to-blue-600 hover:shadow-lg transition-all"
        >
          Continue
        </Button>
      </div>
    </form>
  );
} 