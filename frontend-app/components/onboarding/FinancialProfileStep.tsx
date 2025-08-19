"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  OnboardingData, 
  FundingSource, 
  EmploymentStatus, 
  LiquidNetWorthRange,
  LIQUID_NET_WORTH_DESCRIPTIONS,
  EMPLOYMENT_STATUS_DESCRIPTIONS
} from "@/lib/types/onboarding";
import { InfoIcon } from "lucide-react";
import { InfoTooltip } from "@/components/ui/InfoTooltip"

interface FinancialProfileStepProps {
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

export default function FinancialProfileStep({ 
  data, 
  onUpdate, 
  onContinue, 
  onBack 
}: FinancialProfileStepProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [employerFieldsSkipped, setEmployerFieldsSkipped] = useState(false);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!data.liquidNetWorthRange) {
      newErrors.liquidNetWorthRange = "Please select your liquid net worth range";
    }
    
    if (data.fundingSource.length === 0) {
      newErrors.fundingSource = "Please select at least one funding source";
    }

    if (!data.employmentStatus) {
      newErrors.employmentStatus = "Please select your employment status";
    }

    // Only validate employer fields if employment status is employed and fields are not skipped
    if (data.employmentStatus === EmploymentStatus.EMPLOYED && !employerFieldsSkipped) {
      if (!data.employerName) {
        newErrors.employerName = "Employer name is required for employed status";
      }
      if (!data.employerAddress) {
        newErrors.employerAddress = "Employer address is required for employed status";
      }
      if (!data.employmentPosition) {
        newErrors.employmentPosition = "Job title/position is required for employed status";
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

  const handleEmploymentStatusChange = (status: EmploymentStatus) => {
    const updates: Partial<OnboardingData> = { employmentStatus: status };
    
    // Pre-select funding source based on employment status
    if (status === EmploymentStatus.EMPLOYED) {
      if (!data.fundingSource.includes(FundingSource.EMPLOYMENT_INCOME)) {
        updates.fundingSource = [FundingSource.EMPLOYMENT_INCOME, ...data.fundingSource];
      }
    } else {
      if (!data.fundingSource.includes(FundingSource.SAVINGS)) {
        updates.fundingSource = [FundingSource.SAVINGS, ...data.fundingSource];
      }
    }
    
    // Reset employer fields if not employed
    if (status !== EmploymentStatus.EMPLOYED) {
      updates.employerName = '';
      updates.employerAddress = '';
      updates.employmentPosition = '';
      setEmployerFieldsSkipped(false);
    }
    
    onUpdate(updates);
  };

  const handleSkipEmployerFields = () => {
    setEmployerFieldsSkipped(true);
    onUpdate({
      employerName: '',
      employerAddress: '',
      employmentPosition: ''
    });
  };

  const showEmployerFields = data.employmentStatus === EmploymentStatus.EMPLOYED && !employerFieldsSkipped;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto p-4 sm:p-8">
      <div className="mb-4 sm:mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold mb-2 sm:mb-3 text-white">Financial Profile</h2>
        <p className="text-white text-sm sm:text-base">Please provide information about your financial situation and employment status.</p>
      </div>
      
      <div className="space-y-6 bg-card/50 p-6 rounded-lg border border-border/30 shadow-sm">
        
        {/* Liquid Net Worth */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium">Investible / Liquid Assets</Label>
            <InfoTooltip content="Your net worth minus assets that cannot be converted quickly and easily into cash, such as real estate, business equity, personal property and automobiles, expected inheritances, assets earmarked for other purposes, and investments or accounts subject to substantial penalties if they were sold or if assets were withdrawn from them.">
              <button type="button" className="ml-2" aria-label="Learn more about investible and liquid assets">
                <InfoIcon className="h-4 w-4 text-gray-400" />
              </button>
            </InfoTooltip>
          </div>
          <Select 
            value={data.liquidNetWorthRange} 
            onValueChange={(value: string) => onUpdate({ liquidNetWorthRange: value as LiquidNetWorthRange })}
          >
                          <SelectTrigger className={`${errors.liquidNetWorthRange ? "border-red-500" : "border-gray-300"} rounded-md h-11`}>
              <SelectValue placeholder="Select your investible / liquid assets" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(LiquidNetWorthRange).map(([key, value]) => (
                <SelectItem key={key} value={value}>
                  {LIQUID_NET_WORTH_DESCRIPTIONS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.liquidNetWorthRange && <p className="text-red-500 text-sm mt-1">{errors.liquidNetWorthRange}</p>}
        </div>

        {/* Account Funding Source */}
        <div className="space-y-4">
          <Label className="text-sm font-medium">Account Funding Sources (select all that apply)</Label>
          <div className="grid grid-cols-1 gap-3">
            {Object.values(FundingSource).map((source) => (
              <div key={source} className="flex items-center space-x-3">
                <Checkbox 
                  id={`source-${source}`}
                  checked={data.fundingSource.includes(source)}
                  onCheckedChange={(checked) => 
                    handleFundingSourceChange(source, checked as boolean)
                  }
                />
                <div className="flex items-center space-x-2 flex-1">
                  <Label 
                    htmlFor={`source-${source}`}
                    className="font-normal cursor-pointer"
                  >
                    {source.split('_').map(word => 
                      word.charAt(0).toUpperCase() + word.slice(1)
                    ).join(' ')}
                  </Label>
                  <InfoTooltip content={fundingSourceDescriptions[source]}>
                    <button type="button" className="ml-2" aria-label={`Learn more about ${source.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')} funding source`}>
                      <InfoIcon className="h-4 w-4 text-gray-400" />
                    </button>
                  </InfoTooltip>
                </div>
              </div>
            ))}
          </div>
          {errors.fundingSource && <p className="text-red-500 text-sm mt-1">{errors.fundingSource}</p>}
        </div>

        {/* Employment Status */}
        <div className="space-y-4">
          <Label className="text-sm font-medium">Employment Status</Label>
          <Select 
            value={data.employmentStatus} 
            onValueChange={(value: string) => handleEmploymentStatusChange(value as EmploymentStatus)}
          >
                          <SelectTrigger className={`${errors.employmentStatus ? "border-red-500" : "border-gray-300"} rounded-md h-11`}>
              <SelectValue placeholder="Select your employment status" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(EmploymentStatus).map(([key, value]) => (
                <SelectItem key={key} value={value}>
                  {EMPLOYMENT_STATUS_DESCRIPTIONS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.employmentStatus && <p className="text-red-500 text-sm mt-1">{errors.employmentStatus}</p>}
        </div>

        {/* Employer Information (conditional) */}
        {data.employmentStatus === EmploymentStatus.EMPLOYED && (
          <div className="space-y-4 border-t border-border/30 pt-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Employer Information</Label>
              {!employerFieldsSkipped && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSkipEmployerFields}
                  className="text-xs"
                >
                  Skip for now
                </Button>
              )}
            </div>
            
            {employerFieldsSkipped ? (
              <div className="bg-muted/30 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">
                  Employer information has been skipped.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEmployerFieldsSkipped(false)}
                  className="text-xs"
                >
                  Provide employer information now
                </Button>
              </div>
            ) : showEmployerFields && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="employerName" className="text-sm font-medium">Name of Employer</Label>
                  <Input
                    id="employerName"
                    value={data.employerName || ''}
                    onChange={(e) => onUpdate({ employerName: e.target.value })}
                    className={`mt-1 ${errors.employerName ? "border-red-500" : "border-gray-300"} rounded-md h-11`}
                    placeholder="Company Name Inc."
                  />
                  {errors.employerName && <p className="text-red-500 text-sm mt-1">{errors.employerName}</p>}
                </div>

                <div>
                  <Label htmlFor="employerAddress" className="text-sm font-medium">Employer Address</Label>
                  <Input
                    id="employerAddress"
                    value={data.employerAddress || ''}
                    onChange={(e) => onUpdate({ employerAddress: e.target.value })}
                    className={`mt-1 ${errors.employerAddress ? "border-red-500" : "border-gray-300"} rounded-md h-11`}
                    placeholder="123 Business St, City, State, ZIP"
                  />
                  {errors.employerAddress && <p className="text-red-500 text-sm mt-1">{errors.employerAddress}</p>}
                </div>

                <div>
                  <Label htmlFor="employmentPosition" className="text-sm font-medium">Occupation / Job Title</Label>
                  <Input
                    id="employmentPosition"
                    value={data.employmentPosition || ''}
                    onChange={(e) => onUpdate({ employmentPosition: e.target.value })}
                    className={`mt-1 ${errors.employmentPosition ? "border-red-500" : "border-gray-300"} rounded-md h-11`}
                    placeholder="Software Engineer, Manager, etc."
                  />
                  {errors.employmentPosition && <p className="text-red-500 text-sm mt-1">{errors.employmentPosition}</p>}
                </div>
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
          className="px-8 py-2 ml-auto"
        >
          Continue
        </Button>
      </div>
    </form>
  );
} 