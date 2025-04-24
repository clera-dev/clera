"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { OnboardingData, initialOnboardingData } from "./OnboardingTypes";
import ProgressBar from "./ProgressBar";
import WelcomePage from "./WelcomePage";
import ContactInfoStep from "./ContactInfoStep";
import PersonalInfoStep from "./PersonalInfoStep";
import DisclosuresStep from "./DisclosuresStep";
import AgreementsStep from "./AgreementsStep";
import SubmissionSuccessStep from "./SubmissionSuccessStep";
import { createAlpacaAccount } from "@/utils/api/alpaca";
import { saveOnboardingData } from "@/utils/api/onboarding-client";
import { OnboardingStatus } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { usePostOnboardingNavigation } from "@/utils/navigation";

// Define the Step type
type Step = "welcome" | "contact" | "personal" | "disclosures" | "agreements" | "success";
// Define an enum for numeric step indices
enum StepIndex {
  Welcome = 0,
  Contact = 1,
  Personal = 2,
  Disclosures = 3,
  Agreements = 4,
  Success = 5
}

interface OnboardingFlowProps {
  userId: string;
  initialData?: OnboardingData;
}

export default function OnboardingFlow({ userId, initialData }: OnboardingFlowProps) {
  const router = useRouter();
  const { navigateAfterOnboarding } = usePostOnboardingNavigation();
  const [currentStep, setCurrentStep] = useState<Step>("welcome");
  const [onboardingData, setOnboardingData] = useState<OnboardingData>(
    initialData || initialOnboardingData
  );
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [accountCreated, setAccountCreated] = useState<boolean>(false);
  const [accountExists, setAccountExists] = useState<boolean>(false);

  // Map for converting step string to numeric index
  const stepToIndex: Record<Step, number> = {
    "welcome": StepIndex.Welcome,
    "contact": StepIndex.Contact,
    "personal": StepIndex.Personal,
    "disclosures": StepIndex.Disclosures,
    "agreements": StepIndex.Agreements,
    "success": StepIndex.Success
  };

  const totalSteps = 5; // Welcome + Contact + Personal + Disclosures + Agreements

  // Save progress to Supabase when steps change
  useEffect(() => {
    const currentStepIndex = stepToIndex[currentStep];
    if (currentStepIndex > 0 && currentStepIndex < totalSteps) {
      saveOnboardingProgress();
    }
  }, [currentStep, onboardingData]);

  // Check for intended redirect on mount
  useEffect(() => {
    // Set a cookie to capture any intended redirect if the user tries to navigate away
    const path = window.location.pathname;
    if (path === '/protected') {
      const cookies = document.cookie.split(';');
      const redirectCookie = cookies.find(cookie => cookie.trim().startsWith('intended_redirect='));
      
      if (!redirectCookie) {
        // If there's no redirect cookie yet, set default to dashboard
        document.cookie = 'intended_redirect=/dashboard; Path=/; Max-Age=3600; SameSite=Strict';
      }
    }
  }, []);

  const updateData = (newData: Partial<OnboardingData>) => {
    setOnboardingData(prev => ({ ...prev, ...newData }));
  };

  const nextStep = () => {
    const steps: Step[] = ["welcome", "contact", "personal", "disclosures", "agreements", "success"];
    const currentIndex = steps.indexOf(currentStep);
    
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    }
  };

  const prevStep = () => {
    const steps: Step[] = ["welcome", "contact", "personal", "disclosures", "agreements", "success"];
    const currentIndex = steps.indexOf(currentStep);
    
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
    }
  };

  const saveOnboardingProgress = async () => {
    try {
      // Update the status in the database to 'in_progress'
      const result = await saveOnboardingData(userId, onboardingData, 'in_progress');
      if (!result.success && result.error) {
        console.error('Error saving progress:', result.error);
      }
    } catch (err) {
      console.error('Error saving progress:', err);
    }
  };

  const handleStepCompletion = async () => {
    if (currentStep === "agreements") {
      await submitOnboardingData();
    } else {
      nextStep();
    }
  };

  const resetOnboarding = () => {
    setOnboardingData(initialData || initialOnboardingData);
    setCurrentStep("welcome");
    setSubmissionError(null);
    setAccountCreated(false);
    setAccountExists(false);
  };

  const submitOnboardingData = async () => {
    try {
      setSubmitting(true);
      setSubmissionError(null);
      
      // Create the Alpaca account
      const result = await createAlpacaAccount(onboardingData);
      
      if (result.error) {
        // Handle the account already exists case as a success
        if (result.accountExists) {
          setAccountExists(true);
          
          // Save onboarding status to mark as completed even though the account already exists
          await saveOnboardingData(
            userId,
            onboardingData,
            'submitted', // Set status to 'submitted' in database
            {
              // We don't have the account ID and number, but we can mark it as existing
              accountStatus: 'ACCOUNT_EXISTS'
            }
          );
          
          setAccountCreated(true);
          setSubmitting(false);
          nextStep();
          return;
        }
        
        // Handle other errors
        setSubmissionError(result.error);
        setSubmitting(false);
        nextStep();
        return;
      }
      
      // Save onboarding status to mark as completed
      await saveOnboardingData(
        userId,
        onboardingData,
        'submitted', // Set status to 'submitted' in database
        {
          accountId: result.data?.id,
          accountNumber: result.data?.account_number,
          accountStatus: result.data?.status
        }
      );
      
      setAccountCreated(true);
      setSubmitting(false);
      nextStep();
    } catch (error) {
      console.error("Error in onboarding submission:", error);
      setSubmissionError(error instanceof Error ? error.message : "An unknown error occurred");
      setSubmitting(false);
      nextStep();
    }
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case "welcome":
        return <WelcomePage onContinue={nextStep} />;
      case "contact":
        return (
          <ContactInfoStep 
            data={onboardingData} 
            onUpdate={updateData} 
            onContinue={nextStep} 
          />
        );
      case "personal":
        return (
          <PersonalInfoStep 
            data={onboardingData} 
            onUpdate={updateData} 
            onContinue={nextStep}
            onBack={prevStep}
          />
        );
      case "disclosures":
        return (
          <DisclosuresStep 
            data={onboardingData} 
            onUpdate={updateData} 
            onContinue={nextStep}
            onBack={prevStep}
          />
        );
      case "agreements":
        return (
          <AgreementsStep 
            data={onboardingData} 
            onUpdate={updateData} 
            onContinue={submitOnboardingData}
            onBack={prevStep}
          />
        );
      case "success":
        return (
          <SubmissionSuccessStep 
            data={onboardingData}
            accountCreated={accountCreated}
            errorMessage={submissionError || undefined}
            accountExists={accountExists}
            onBack={() => setCurrentStep("agreements")}
            onReset={resetOnboarding}
          />
        );
      default:
        return <WelcomePage onContinue={nextStep} />;
    }
  };

  return (
    <div className="w-full">
      {stepToIndex[currentStep] > 0 && stepToIndex[currentStep] < totalSteps && (
        <ProgressBar 
          currentStep={stepToIndex[currentStep]} 
          totalSteps={totalSteps - 1} 
        />
      )}
      
      {submissionError && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <p>{submissionError}</p>
        </div>
      )}
      
      {submitting ? (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="mt-4 text-muted-foreground">Submitting your application...</p>
        </div>
      ) : (
        renderCurrentStep()
      )}
    </div>
  );
} 