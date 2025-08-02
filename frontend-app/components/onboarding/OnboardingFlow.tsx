"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { OnboardingData } from "@/lib/types/onboarding";
import { initialOnboardingData } from "./OnboardingTypes";
import ProgressBar from "./ProgressBar";
import WelcomePage from "./WelcomePage";
import ContactInfoStep from "./ContactInfoStep";
import PersonalInfoStep from "./PersonalInfoStep";
import FinancialProfileStep from "./FinancialProfileStep";
import DisclosuresStep from "./DisclosuresStep";
import AgreementsStep from "./AgreementsStep";
import OnboardingSuccessLoading from "./OnboardingSuccessLoading";
import { createAlpacaAccount } from "@/utils/api/alpaca";
import { saveOnboardingData } from "@/utils/api/onboarding-client";
import { OnboardingStatus } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { usePostOnboardingNavigation } from "@/utils/navigation";

// Define the Step type
type Step = "welcome" | "contact" | "personal" | "financial" | "disclosures" | "agreements" | "loading" | "success";
// Define an enum for numeric step indices
enum StepIndex {
  Welcome = 0,
  Contact = 1,
  Personal = 2,
  Financial = 3,
  Disclosures = 4,
  Agreements = 5,
  Loading = 6,
  Success = 7
}

interface OnboardingFlowProps {
  userId: string;
  userEmail?: string;
  initialData?: OnboardingData;
}

export default function OnboardingFlow({ userId, userEmail, initialData }: OnboardingFlowProps) {
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
    "financial": StepIndex.Financial,
    "disclosures": StepIndex.Disclosures,
    "agreements": StepIndex.Agreements,
    "loading": StepIndex.Loading,
    "success": StepIndex.Success
  };

  const totalSteps = 5; // Contact + Personal + Financial + Disclosures + Agreements

  // Save progress to Supabase when steps change
  useEffect(() => {
    const currentStepIndex = stepToIndex[currentStep];
    if (currentStepIndex > 0 && currentStepIndex <= totalSteps) {
      saveOnboardingProgress();
    }
  }, [currentStep, onboardingData]);

  // Scroll to top when step changes (but not on initial load)
  useEffect(() => {
    // Skip scroll on initial load (welcome step)
    if (currentStep !== "welcome") {
      // Use setTimeout to ensure the new content is rendered
      const timeoutId = setTimeout(() => {
        // Use instant scroll to ensure it works reliably
        window.scrollTo({ top: 0, behavior: 'instant' });
        // Also try to scroll the document element for better compatibility
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      }, 50);
      
      // Clean up timeout on unmount or when currentStep changes
      return () => clearTimeout(timeoutId);
    }
  }, [currentStep]);

  // Check for intended redirect on mount
  useEffect(() => {
    // Set a cookie to capture any intended redirect if the user tries to navigate away
    const path = window.location.pathname;
    if (path === '/protected') {
      const cookies = document.cookie.split(';');
      const redirectCookie = cookies.find(cookie => cookie.trim().startsWith('intended_redirect='));
      
      if (!redirectCookie) {
        // If there's no redirect cookie yet, set default to portfolio
        document.cookie = 'intended_redirect=/portfolio; Path=/; Max-Age=3600; SameSite=Strict';
      }
    }
  }, []);

  const updateData = (newData: Partial<OnboardingData>) => {
    setOnboardingData(prev => ({ ...prev, ...newData }));
  };

  const nextStep = () => {
    const steps: Step[] = ["welcome", "contact", "personal", "financial", "disclosures", "agreements", "loading", "success"];
    const currentIndex = steps.indexOf(currentStep);
    
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    }
  };

  const prevStep = () => {
    const steps: Step[] = ["welcome", "contact", "personal", "financial", "disclosures", "agreements", "loading", "success"];
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
          setCurrentStep("loading"); // Show loading page instead of navigating away
          return;
        }
        
        // Handle other errors
        setSubmissionError(result.error);
        setSubmitting(false);
        // Do not navigate away on error
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
      setCurrentStep("loading"); // Show loading page instead of navigating away
    } catch (error) {
      console.error("Error in onboarding submission:", error);
      setSubmissionError(error instanceof Error ? error.message : "An unknown error occurred");
      setSubmitting(false);
      // Do not navigate away on error
    }
  };

  const handleLoadingComplete = () => {
    // Instead of navigating away immediately, just refresh the page to show the protected page content
    window.location.reload();
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
            onContinue={handleStepCompletion}
            userEmail={userEmail}
          />
        );
      case "personal":
        return (
          <PersonalInfoStep 
            data={onboardingData} 
            onUpdate={updateData} 
            onContinue={handleStepCompletion} 
            onBack={prevStep}
          />
        );
      case "financial":
        return (
          <FinancialProfileStep 
            data={onboardingData} 
            onUpdate={updateData} 
            onContinue={handleStepCompletion} 
            onBack={prevStep}
          />
        );
      case "disclosures":
        return (
          <DisclosuresStep 
            data={onboardingData} 
            onUpdate={updateData} 
            onContinue={handleStepCompletion} 
            onBack={prevStep}
          />
        );
      case "agreements":
        return (
          <AgreementsStep 
            data={onboardingData} 
            onUpdate={updateData} 
            onContinue={handleStepCompletion} 
            onBack={prevStep}
            isSubmitting={submitting}
            submissionError={submissionError}
          />
        );
      case "loading":
        return <OnboardingSuccessLoading onComplete={handleLoadingComplete} />;
      case "success":
        // This step is no longer used, navigation happens directly
        return null;
      default:
        return <WelcomePage onContinue={nextStep} />;
    }
  };

  // Calculate progress percentage
  const calculateProgress = () => {
    const currentStepIndex = stepToIndex[currentStep];
    
    // Custom calculation for the success step to show 100%
    if (currentStep === "success") {
      return 100;
    }
    
    // For other steps, calculate percentage based on step index
    return Math.round((currentStepIndex / totalSteps) * 100);
  };

  return (
    <div className="flex flex-col w-full">
      <div className="w-full max-w-2xl mx-auto pt-2 sm:pt-5">
        {/* Progress bar - don't show for welcome, loading, or success pages */}
        {currentStep !== "welcome" && currentStep !== "loading" && currentStep !== "success" && (
          <div className="mb-6">
            <ProgressBar 
              currentStep={stepToIndex[currentStep]} 
              totalSteps={totalSteps}
              stepNames={[
                "Contact Info",
                "Personal Info",
                "Financial Profile",
                "Disclosures",
                "Agreements"
              ]}
              percentComplete={calculateProgress()}
            />
          </div>
        )}
        
        {/* Render the current step in a nicely styled container */}
        <div className="bg-card border border-border/40 rounded-xl shadow-lg overflow-hidden">
          {renderCurrentStep()}
        </div>
      </div>
    </div>
  );
} 