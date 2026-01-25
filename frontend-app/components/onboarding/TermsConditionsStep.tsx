"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { OnboardingData } from "@/lib/types/onboarding";
import { PersonalizationFormData } from "@/lib/types/personalization";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ExternalLink, FileText, Shield, Bot, PenLine, Lock, Loader2 } from "lucide-react";
import { saveOrUpdatePersonalizationData } from "@/utils/api/personalization-client";

// Legal document URLs - hosted in /public/legal/
const LEGAL_DOCUMENTS = {
  formCRS: "/legal/form-crs.pdf",
  formADVPart2A: "/legal/form-adv-part-2a.pdf",
  advisoryAgreement: "/legal/investment-advisory-agreement.pdf",
  privacyPolicy: "/legal/privacy-policy.pdf",
  // SEC IAPD links for official filings
  secFormADV: "https://reports.adviserinfo.sec.gov/reports/ADV/338073/PDF/338073.pdf",
  secFormCRS: "https://reports.adviserinfo.sec.gov/crs/crs_338073.pdf",
};

interface TermsConditionsStepProps {
  data: OnboardingData;
  personalizationData: PersonalizationFormData;
  onUpdate: (data: Partial<OnboardingData>) => void;
  onContinue: () => void;
  onBack: () => void;
}

export default function TermsConditionsStep({
  data,
  personalizationData,
  onUpdate,
  onContinue,
  onBack,
}: TermsConditionsStepProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  
  // Initialize cleraAgreementsAccepted if it doesn't exist
  const agreements = data.cleraAgreementsAccepted || {
    formCRS: false,
    formADVPart2A: false,
    advisoryAgreement: false,
    privacyPolicy: false,
    eSignConsent: false,
    aiDisclosure: false,
  };

  const allAgreementsAccepted = 
    agreements.formCRS &&
    agreements.formADVPart2A &&
    agreements.advisoryAgreement &&
    agreements.privacyPolicy &&
    agreements.eSignConsent &&
    agreements.aiDisclosure;

  const handleAgreementChange = (
    key: keyof typeof agreements,
    checked: boolean
  ) => {
    onUpdate({
      cleraAgreementsAccepted: {
        ...agreements,
        [key]: checked,
      }
    });
  };

  const handleAcceptAll = () => {
    onUpdate({
      cleraAgreementsAccepted: {
        formCRS: true,
        formADVPart2A: true,
        advisoryAgreement: true,
        privacyPolicy: true,
        eSignConsent: true,
        aiDisclosure: true,
      },
      cleraAgreementsTimestamp: new Date().toISOString(),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allAgreementsAccepted) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Record the timestamp when all agreements are accepted
      const timestamp = new Date().toISOString();
      onUpdate({
        cleraAgreementsTimestamp: timestamp,
      });

      // Save all personalization data to Supabase
      console.log('📝 [Terms] Saving personalization data...');
      const result = await saveOrUpdatePersonalizationData(personalizationData);
      
      if (!result.success) {
        console.error('❌ [Terms] Failed to save personalization data:', result.error);
        setSubmitError(result.error || 'Failed to save your information. Please try again.');
        return;
      }

      console.log('✅ [Terms] Personalization data saved successfully');
      onContinue();
    } catch (error) {
      console.error('❌ [Terms] Error saving data:', error);
      setSubmitError(
        error instanceof Error 
          ? error.message 
          : 'An unexpected error occurred. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const openDocument = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="onboarding-container">
      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto p-4 sm:p-8">
        <div className="mb-4 sm:mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold mb-2 sm:mb-3 text-white">
            Terms & Disclosures
          </h2>
          <p className="text-white/80 text-sm sm:text-base">
            As an SEC-registered investment adviser, we are required to provide you with the following disclosures. 
            Please review each document and acknowledge your understanding.
          </p>
        </div>

        <div className="space-y-4">
          {/* Form CRS - Client Relationship Summary */}
          <div className="bg-card/50 p-4 rounded-lg border border-border/30 shadow-sm">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="formCRS"
                checked={agreements.formCRS}
                onCheckedChange={(checked) => handleAgreementChange('formCRS', !!checked)}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="formCRS" className="font-medium cursor-pointer flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Form CRS (Client Relationship Summary)
                  </Label>
                  <button
                    type="button"
                    onClick={() => openDocument(LEGAL_DOCUMENTS.formCRS)}
                    className="text-primary hover:text-primary/80 text-sm flex items-center gap-1"
                  >
                    View <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  A summary of our services, fees, conflicts of interest, and how to contact us.
                </p>
              </div>
            </div>
          </div>

          {/* Form ADV Part 2A - Firm Brochure */}
          <div className="bg-card/50 p-4 rounded-lg border border-border/30 shadow-sm">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="formADVPart2A"
                checked={agreements.formADVPart2A}
                onCheckedChange={(checked) => handleAgreementChange('formADVPart2A', !!checked)}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="formADVPart2A" className="font-medium cursor-pointer flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Form ADV Part 2A (Firm Brochure)
                  </Label>
                  <button
                    type="button"
                    onClick={() => openDocument(LEGAL_DOCUMENTS.formADVPart2A)}
                    className="text-primary hover:text-primary/80 text-sm flex items-center gap-1"
                  >
                    View <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Detailed information about our business practices, investment strategies, fees, and potential risks.
                </p>
              </div>
            </div>
          </div>

          {/* Investment Advisory Agreement */}
          <div className="bg-card/50 p-4 rounded-lg border border-border/30 shadow-sm">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="advisoryAgreement"
                checked={agreements.advisoryAgreement}
                onCheckedChange={(checked) => handleAgreementChange('advisoryAgreement', !!checked)}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="advisoryAgreement" className="font-medium cursor-pointer flex items-center gap-2">
                    <PenLine className="h-4 w-4 text-primary" />
                    Investment Advisory Agreement
                  </Label>
                  <button
                    type="button"
                    onClick={() => openDocument(LEGAL_DOCUMENTS.advisoryAgreement)}
                    className="text-primary hover:text-primary/80 text-sm flex items-center gap-1"
                  >
                    View <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  The agreement governing our advisory relationship, including scope of services and fees.
                </p>
              </div>
            </div>
          </div>

          {/* Privacy Policy */}
          <div className="bg-card/50 p-4 rounded-lg border border-border/30 shadow-sm">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="privacyPolicy"
                checked={agreements.privacyPolicy}
                onCheckedChange={(checked) => handleAgreementChange('privacyPolicy', !!checked)}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="privacyPolicy" className="font-medium cursor-pointer flex items-center gap-2">
                    <Lock className="h-4 w-4 text-primary" />
                    Privacy Policy
                  </Label>
                  <button
                    type="button"
                    onClick={() => openDocument(LEGAL_DOCUMENTS.privacyPolicy)}
                    className="text-primary hover:text-primary/80 text-sm flex items-center gap-1"
                  >
                    View <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  How we collect, use, and protect your personal and financial information (Regulation S-P).
                </p>
              </div>
            </div>
          </div>

          {/* E-SIGN Consent */}
          <div className="bg-card/50 p-4 rounded-lg border border-border/30 shadow-sm">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="eSignConsent"
                checked={agreements.eSignConsent}
                onCheckedChange={(checked) => handleAgreementChange('eSignConsent', !!checked)}
                className="mt-1"
              />
              <div className="flex-1">
                <Label htmlFor="eSignConsent" className="font-medium cursor-pointer flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  Electronic Signature Consent (E-SIGN Act)
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  I consent to receive disclosures and sign documents electronically. I understand I may request 
                  paper copies at any time by contacting support@askclera.com. I have access to a device and 
                  software capable of viewing PDF documents.
                </p>
              </div>
            </div>
          </div>

          {/* AI/Algorithmic Disclosure */}
          <div className="bg-card/50 p-4 rounded-lg border border-border/30 shadow-sm">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="aiDisclosure"
                checked={agreements.aiDisclosure}
                onCheckedChange={(checked) => handleAgreementChange('aiDisclosure', !!checked)}
                className="mt-1"
              />
              <div className="flex-1">
                <Label htmlFor="aiDisclosure" className="font-medium cursor-pointer flex items-center gap-2">
                  <Bot className="h-4 w-4 text-primary" />
                  AI-Powered Advisory Disclosure
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  I understand that Clera uses artificial intelligence to provide investment recommendations 
                  and portfolio analysis. I acknowledge that AI-generated advice has limitations and that 
                  investment decisions are ultimately my responsibility. Human support is available upon request.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Accept All Button */}
        {!allAgreementsAccepted && (
          <div className="flex justify-center pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleAcceptAll}
              className="text-sm"
            >
              Accept All Disclosures
            </Button>
          </div>
        )}

        {/* SEC Registration Notice */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mt-4">
          <p className="text-xs text-blue-200">
            <strong>SEC Registration:</strong> Clera, Inc. is a registered investment adviser with the 
            U.S. Securities and Exchange Commission (SEC # 801-134566, CRD # 338073). Registration does 
            not imply a certain level of skill or training. You can verify our registration and view 
            our public filings at{" "}
            <a 
              href="https://adviserinfo.sec.gov/firm/summary/338073" 
              target="_blank" 
              rel="noopener noreferrer"
              className="underline hover:text-blue-100"
            >
              adviserinfo.sec.gov
            </a>.
          </p>
        </div>

        {/* Error display */}
        {submitError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mt-4">
            <p className="text-sm text-red-400">{submitError}</p>
          </div>
        )}

        {/* Navigation Buttons - matching PersonalizationStep style */}
        <div className="flex items-center justify-between gap-4 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            disabled={isSubmitting}
            className="flex items-center gap-2 min-w-[80px]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            Back
          </Button>
          
          {/* Step indicator */}
          <div className="flex-1 text-center">
            <span className="text-sm text-gray-400">
              8 of 8
            </span>
          </div>
          
          <Button
            type="submit"
            className="flex items-center gap-2 min-w-[100px] bg-gradient-to-r from-primary to-blue-600 hover:shadow-lg transition-all"
            disabled={!allAgreementsAccepted || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Submit'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
