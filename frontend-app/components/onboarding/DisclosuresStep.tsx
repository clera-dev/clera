"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { OnboardingData } from "@/lib/types/onboarding";
import { Checkbox } from "@/components/ui/checkbox";
import { FileUpload } from './FileUpload';

interface DisclosuresStepProps {
  data: OnboardingData;
  onUpdate: (data: Partial<OnboardingData>) => void;
  onContinue: () => void;
  onBack: () => void;
}

export default function DisclosuresStep({
  data,
  onUpdate,
  onContinue,
  onBack,
}: DisclosuresStepProps) {

  const isNoneSelected =
    !data.isAffiliatedExchangeOrFinra &&
    !data.isControlPerson &&
    !data.isPoliticallyExposed &&
    !data.immediateFamilyExposed;

  const handleAffiliationChange = (
    changedKey: keyof Pick<
      OnboardingData,
      | 'isAffiliatedExchangeOrFinra'
      | 'isControlPerson'
      | 'isPoliticallyExposed'
      | 'immediateFamilyExposed'
    >,
    isChecked: boolean
  ) => {
    onUpdate({
      ...data,
      [changedKey]: isChecked,
    });
  };

  const handleNoneChange = (isChecked: boolean) => {
    if (isChecked) {
      onUpdate({
        isAffiliatedExchangeOrFinra: false,
        isControlPerson: false,
        isPoliticallyExposed: false,
        immediateFamilyExposed: false,
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onContinue();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto p-4 sm:p-8">
      <div className="mb-4 sm:mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold mb-2 sm:mb-3 text-white">Disclosures</h2>
        <p className="text-white text-sm sm:text-base">
          Please answer the following question accurately. These declarations will not apply to most customers.
        </p>
      </div>
      
      <div className="space-y-6 bg-card/50 p-6 rounded-lg border border-border/30 shadow-sm">
        <div className="space-y-4">
          <Label className="font-medium text-base">
            Do any of the following apply to you or a member of your immediate family?
          </Label>
          
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="finra"
                checked={data.isAffiliatedExchangeOrFinra}
                onCheckedChange={(checked) => handleAffiliationChange('isAffiliatedExchangeOrFinra', !!checked)}
              />
              <div className="flex-1">
                <Label htmlFor="finra" className="font-normal cursor-pointer">
                  Affiliated or work with a US registered broker-dealer or FINRA.
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Are you or an immediate family member affiliated with or employed by a stock exchange, regulatory body, member firm of an exchange, FINRA or a municipal securities broker-dealer?
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <Checkbox
                id="public_company"
                checked={data.isControlPerson}
                onCheckedChange={(checked) => handleAffiliationChange('isControlPerson', !!checked)}
              />
              <div className="flex-1">
                <Label htmlFor="public_company" className="font-normal cursor-pointer">
                  Senior executive at or a 10% or greater shareholder of a publicly traded company.
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Are you or an immediate family member an officer or 10% or greater shareholder of a publicly traded company, subject to the US Securities Exchange Act 1934?
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <Checkbox
                id="pep_self"
                checked={data.isPoliticallyExposed}
                onCheckedChange={(checked) => handleAffiliationChange('isPoliticallyExposed', !!checked)}
              />
              <div className="flex-1">
                <Label htmlFor="pep_self" className="font-normal cursor-pointer">
                  I am a senior political figure.
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  A "Politically Exposed Person" (PEP) is defined by FATF as an individual who is or has been entrusted with a prominent public function, for example: Heads of State or of government, senior politicians, senior government, judicial or military officials, senior executives of state-owned corporations, or important political party officials.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <Checkbox
                id="pep_family"
                checked={data.immediateFamilyExposed}
                onCheckedChange={(checked) => handleAffiliationChange('immediateFamilyExposed', !!checked)}
              />
              <div className="flex-1">
                <Label htmlFor="pep_family" className="font-normal cursor-pointer">
                  I am a family member or relative of a senior political figure.
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Are you or an immediate family member currently or formerly a Politically Exposed Person or Public Official?
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <Checkbox
                id="none"
                checked={isNoneSelected}
                onCheckedChange={(checked) => handleNoneChange(!!checked)}
              />
              <div className="flex-1">
                <Label htmlFor="none" className="font-medium cursor-pointer">
                  None of the above apply to me or my family.
                </Label>
              </div>
            </div>
          </div>
          
          {(data.isAffiliatedExchangeOrFinra || data.isControlPerson) && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg space-y-4">
              <p className="text-sm text-yellow-800">
                <strong>Additional Documentation Required:</strong> You will need to obtain a letter written and signed by a compliance officer on company letterhead explicitly granting permission for you to carry this account. This letter must also state whether or not the firm requires access to duplicate account statements and/or trade confirmations.
              </p>
              <FileUpload
                label="Upload Approval Letter"
                onFileChange={(base64) => onUpdate({ account_approval_letter: base64 })}
              />
            </div>
          )}

          {(data.isPoliticallyExposed || data.immediateFamilyExposed) && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Additional Review Required:</strong> Alpaca's AML committee will evaluate your account application before approving or rejecting it.
              </p>
            </div>
          )}
        </div>
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