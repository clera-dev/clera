"use client";

import { Button } from "@/components/ui/button";
import { OnboardingData } from "@/lib/types/onboarding";
import AgreementViewer from "./AgreementViewer";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

// Agreement PDF URLs
const AGREEMENT_URLS = {
  customer: "https://files.alpaca.markets/disclosures/library/AcctAppMarginAndCustAgmt.pdf"
};

interface AgreementsStepProps {
  data: OnboardingData;
  onUpdate: (data: Partial<OnboardingData>) => void;
  onContinue: () => void;
  onBack: () => void;
  isSubmitting?: boolean;
  submissionError?: string | null;
}

export default function AgreementsStep({
  data,
  onUpdate,
  onContinue,
  onBack,
  isSubmitting = false,
  submissionError = null
}: AgreementsStepProps) {

  const allRequiredAgreementsAccepted = 
    data.agreementsAccepted.customer && data.agreementsAccepted.account;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (allRequiredAgreementsAccepted) {
      onContinue();
    }
  };

  const handleAgreementChange = (accepted: boolean) => {
    onUpdate({
      agreementsAccepted: {
        ...data.agreementsAccepted,
        customer: accepted,
        account: accepted,
      }
    });
  };

  return (
    <div className="onboarding-container">
      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto p-4 sm:p-8">
      <div className="mb-4 sm:mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold mb-2 sm:mb-3 text-white">Agreements</h2>
        <p className="text-white text-sm sm:text-base">Please review and accept the following agreements to complete your account setup.</p>
      </div>
      
      <div className="space-y-6 bg-card/50 p-6 rounded-lg border border-border/30 shadow-sm">
        
        {/* Alpaca Customer Agreement */}
        <div className="space-y-4">
          <h3 className="font-medium text-lg">Alpaca Customer Agreement</h3>
          <AgreementViewer 
            agreementUrl={AGREEMENT_URLS.customer}
            title="Alpaca Customer Agreement"
          />
          
          {/* Combined Agreement Section */}
          <div className="space-y-4 border border-border/30 rounded-lg p-4 bg-muted/20">
            <p className="text-sm leading-relaxed">
              I have read, understood, and agree to be bound by Alpaca Securities LLC and Clera account terms, and all other terms, disclosures and disclaimers applicable to me, as referenced in the Alpaca Customer Agreement. I also acknowledge that the Alpaca Customer Agreement contains a pre-dispute arbitration clause in Section 43.
            </p>
            <p className="text-sm leading-relaxed mt-4">
            By clicking 'I agree' I understand that I am signing signing this agreement electronically, and that my electronic signature will have the same effect as physically signing and returning the Application Agreement.
            </p>
          </div>
          
          <div className="flex items-center space-x-2 pt-2">
            <Checkbox 
              id="agree-to-terms" 
              checked={allRequiredAgreementsAccepted}
              onCheckedChange={(checked) => handleAgreementChange(!!checked)}
            />
            <Label htmlFor="agree-to-terms" className="cursor-pointer">I agree to the terms and conditions outlined above.</Label>
          </div>
        </div>
      </div>

      {submissionError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-center">
          <p className="text-sm text-red-800">
            <strong>Submission Failed:</strong> {submissionError}
          </p>
        </div>
      )}

      <div className="flex gap-4 pt-4">
        <Button 
          type="button" 
          variant="outline" 
          onClick={onBack} 
          className="px-6 py-2 border-border/40"
          disabled={isSubmitting}
        >
          Back
        </Button>

        <Button
          type="submit"
          className="px-8 py-2 ml-auto bg-gradient-to-r from-primary to-blue-600 hover:shadow-lg transition-all"
          disabled={!allRequiredAgreementsAccepted || isSubmitting}
        >
          {isSubmitting ? (
            <>
              <span className="mr-2">
                <span className="animate-spin inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
              </span>
              Submitting...
            </>
          ) : "Submit"}
        </Button>

      </div>
      </form>
    </div>
  );
} 