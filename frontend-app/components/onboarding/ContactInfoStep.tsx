"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OnboardingData } from "@/lib/types/onboarding";
import { PhoneInput } from "@/components/ui/phone-input";
import { isValidPhoneNumber } from "react-phone-number-input";
import { InfoIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ContactInfoStepProps {
  data: OnboardingData;
  onUpdate: (data: Partial<OnboardingData>) => void;
  onContinue: () => void;
}

export default function ContactInfoStep({ data, onUpdate, onContinue }: ContactInfoStepProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!data.email) newErrors.email = "Email is required";
    else if (!/^\S+@\S+\.\S+$/.test(data.email)) newErrors.email = "Please enter a valid email";
    
    if (!data.phoneNumber) newErrors.phoneNumber = "Phone number is required";
    else if (!isValidPhoneNumber(data.phoneNumber)) newErrors.phoneNumber = "Please enter a valid phone number";
    
    if (!data.streetAddress[0]) newErrors.streetAddress = "Permanent residential address is required";
    if (!data.city) newErrors.city = "City is required";
    if (!data.state) newErrors.state = "State is required";
    if (!data.postalCode) newErrors.postalCode = "Postal code is required";
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onContinue();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto p-8">
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-3 bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">Contact Information</h2>
        <p className="text-muted-foreground">Please provide your contact details to continue with your account setup.</p>
      </div>
      
      <div className="space-y-6 bg-card/50 p-6 rounded-lg border border-border/30 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <Label htmlFor="email" className="text-sm font-medium">Email Address</Label>
            <Input
              id="email"
              type="email"
              value={data.email}
              onChange={(e) => onUpdate({ email: e.target.value })}
              className={`mt-1 ${errors.email ? "border-red-500" : "border-border/40"} rounded-md h-11`}
              placeholder="you@example.com"
            />
            {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
          </div>

          <div>
            <Label htmlFor="phone" className="text-sm font-medium">Phone Number</Label>
            <PhoneInput
              id="phone"
              defaultCountry="US"
              value={data.phoneNumber}
              onChange={(value) => onUpdate({ phoneNumber: value as string })}
              className={`mt-1 ${errors.phoneNumber ? "border-red-500" : "border-border/40"} rounded-md`}
            />
            {errors.phoneNumber && <p className="text-red-500 text-sm mt-1">{errors.phoneNumber}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <Label htmlFor="streetAddress" className="text-sm font-medium">Permanent Residential Address</Label>
            <Input
              id="streetAddress"
              value={data.streetAddress[0]}
              onChange={(e) => onUpdate({ streetAddress: [e.target.value] })}
              className={`mt-1 ${errors.streetAddress ? "border-red-500" : "border-border/40"} rounded-md h-11`}
              placeholder="123 Main St"
            />
            {errors.streetAddress && <p className="text-red-500 text-sm mt-1">{errors.streetAddress}</p>}
          </div>
          
          <div>
            <Label htmlFor="unit" className="text-sm font-medium">Unit / Apt #</Label>
            <Input
              id="unit"
              value={data.unit || ''}
              onChange={(e) => onUpdate({ unit: e.target.value })}
              className="mt-1 border-border/40 rounded-md h-11"
              placeholder="Apt 4B"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="city" className="text-sm font-medium">City</Label>
            <Input
              id="city"
              value={data.city}
              onChange={(e) => onUpdate({ city: e.target.value })}
              className={`mt-1 ${errors.city ? "border-red-500" : "border-border/40"} rounded-md h-11`}
              placeholder="New York"
            />
            {errors.city && <p className="text-red-500 text-sm mt-1">{errors.city}</p>}
          </div>
          
          <div>
            <Label htmlFor="state" className="text-sm font-medium">State</Label>
            <Input
              id="state"
              value={data.state}
              onChange={(e) => onUpdate({ state: e.target.value })}
              className={`mt-1 ${errors.state ? "border-red-500" : "border-border/40"} rounded-md h-11`}
              placeholder="NY"
            />
            {errors.state && <p className="text-red-500 text-sm mt-1">{errors.state}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="postalCode" className="text-sm font-medium">Postal Code</Label>
            <Input
              id="postalCode"
              value={data.postalCode}
              onChange={(e) => onUpdate({ postalCode: e.target.value })}
              className={`mt-1 ${errors.postalCode ? "border-red-500" : "border-border/40"} rounded-md h-11`}
              placeholder="10001"
            />
            {errors.postalCode && <p className="text-red-500 text-sm mt-1">{errors.postalCode}</p>}
          </div>
          
          <div>
            <div className="flex items-center gap-2">
              <Label htmlFor="country" className="text-sm font-medium">Country</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <InfoIcon tabIndex={0} className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>We are currently only available in the USA.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input
              id="country"
              value={data.country}
              onChange={(e) => onUpdate({ country: e.target.value })}
              disabled
              className="mt-1 border-border/40 bg-muted/50 rounded-md h-11"
            />
          </div>
        </div>
      </div>

      <div className="pt-4 flex justify-end">
        <Button 
          type="submit" 
          className="px-8 py-6 text-base font-medium rounded-md bg-gradient-to-r from-primary to-blue-600 hover:shadow-lg transition-all"
        >
          Continue to Next Step
        </Button>
      </div>
    </form>
  );
} 