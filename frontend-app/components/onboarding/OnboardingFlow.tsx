"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { OnboardingData } from "@/lib/types/onboarding";
import { initialOnboardingData } from "./OnboardingTypes";
import ProgressBar from "./ProgressBar";
import PersonalizationStep from "./PersonalizationStep";
import WelcomePage from "./WelcomePage";
import ContactInfoStep from "./ContactInfoStep";
import PersonalInfoStep from "./PersonalInfoStep";
import FinancialProfileStep from "./FinancialProfileStep";
import DisclosuresStep from "./DisclosuresStep";
import AgreementsStep from "./AgreementsStep";
import OnboardingSuccessLoading from "./OnboardingSuccessLoading";
import PersonalizationSuccess from "./PersonalizationSuccess";
import PlaidConnectionStep from "./PlaidConnectionStep";
import { getPersonalizationData } from "@/utils/api/personalization-client";
import { createAlpacaAccount } from "@/utils/api/alpaca";
import { saveOnboardingData } from "@/utils/api/onboarding-client";
import { OnboardingStatus } from "@/lib/types/onboarding";
import { Button } from "@/components/ui/button";
import { usePostOnboardingNavigation } from "@/utils/navigation";
import { 
  PersonalizationFormData, 
} from "@/lib/types/personalization";
import { initialPersonalizationData } from "@/utils/services/personalization-data";

// Define the Step type
type Step = "welcome" | "personalization" | "personalization_success" | "plaid_connection" | "contact" | "personal" | "financial" | "disclosures" | "agreements" | "loading" | "success";

// Single source of truth for step sequence
// NOTE: In hybrid mode, brokerage (KYC) comes FIRST, then Plaid connection
const ONBOARDING_STEPS: Step[] = [
  "welcome",
  "personalization",
  "personalization_success",
  "contact",        // KYC steps come first in hybrid mode
  "personal",
  "financial",
  "disclosures",
  "agreements",
  "plaid_connection",  // Plaid comes AFTER brokerage setup in hybrid mode
  "loading",
  "success"
];

// Step display names for UI components
const STEP_DISPLAY_NAMES: Record<Step, string> = {
  "welcome": "Welcome",
  "personalization": "Personalize Experience",
  "personalization_success": "Personalization Saved",
  "plaid_connection": "Connect Accounts",
  "contact": "Contact Info",
  "personal": "Personal Info", 
  "financial": "Financial Profile",
  "disclosures": "Disclosures",
  "agreements": "Agreements",
  "loading": "Loading",
  "success": "Success"
};

// Define an enum for numeric step indices (derived from the steps array)
enum StepIndex {
  Welcome = 0,
  Personalization = 1,
  PersonalizationSuccess = 2,
  Contact = 3,
  Personal = 4,
  Financial = 5,
  Disclosures = 6,
  Agreements = 7,
  PlaidConnection = 8,  // Plaid comes AFTER KYC in the sequence
  Loading = 9,
  Success = 10
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
  const [personalizationData, setPersonalizationData] = useState<PersonalizationFormData>(
    initialPersonalizationData
  );
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [accountCreated, setAccountCreated] = useState<boolean>(false);
  const [accountExists, setAccountExists] = useState<boolean>(false);
  const [createdAccountId, setCreatedAccountId] = useState<string | null>(null);
  
  // Track personalization step progress
  const [personalizationStep, setPersonalizationStep] = useState(0);
  const [personalizationTotalSteps, setPersonalizationTotalSteps] = useState(7);
  const [hasPersonalization, setHasPersonalization] = useState<boolean>(false);
  const [personalizationChecked, setPersonalizationChecked] = useState<boolean>(false);
  
  // Portfolio mode detection for conditional flow routing
  const [portfolioMode, setPortfolioMode] = useState<string>('loading');
  const [modeChecked, setModeChecked] = useState<boolean>(false);

  // Map for converting step string to numeric index (derived from ONBOARDING_STEPS)
  const stepToIndex: Record<Step, number> = ONBOARDING_STEPS.reduce((acc, step, index) => {
    acc[step] = index;
    return acc;
  }, {} as Record<Step, number>);

  // Calculate total steps dynamically from ONBOARDING_STEPS (excluding welcome, personalization, loading, success)
  const totalSteps = ONBOARDING_STEPS.filter(step => 
    step !== "welcome" && step !== "personalization" && step !== "personalization_success" && step !== "loading" && step !== "success"
  ).length;

  // Save progress to Supabase when steps change
  useEffect(() => {
    const currentStepIndex = stepToIndex[currentStep];
    if (currentStepIndex > 2 && currentStepIndex <= totalSteps + 2) { // Skip welcome (0), personalization (1), personalization_success (2)
      saveOnboardingProgress();
    }
  }, [currentStep, onboardingData]);

  // Scroll to top when step changes (but not on initial load)
  useEffect(() => {
    // Skip scroll on initial load (welcome and personalization steps)
    if (currentStep !== "welcome" && currentStep !== "personalization" && currentStep !== "personalization_success") {
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
    // Prefetch personalization so we can skip that step if already completed
    (async () => {
      try {
        const existing = await getPersonalizationData();
        if (existing) {
          setHasPersonalization(true);
          setPersonalizationData(existing);
        }
      } catch (e) {
        // non-fatal
        console.warn('Unable to prefetch personalization');
      } finally {
        setPersonalizationChecked(true);
      }
    })();
    
    // Fetch portfolio mode to determine onboarding flow
    fetchPortfolioMode();

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

  const updatePersonalizationData = (newData: Partial<PersonalizationFormData>) => {
    setPersonalizationData(prev => ({ ...prev, ...newData }));
    // If the user edits personalization later, allow showing those steps again
    if (hasPersonalization) {
      setHasPersonalization(false);
    }
  };

  // Fetch portfolio mode to determine onboarding flow
  const fetchPortfolioMode = async () => {
    try {
      const response = await fetch('/api/portfolio/connection-status');
      if (response.ok) {
        const data = await response.json();
        setPortfolioMode(data.portfolio_mode || 'aggregation');
      } else {
        // Default to aggregation mode if API fails
        setPortfolioMode('aggregation');
      }
    } catch (error) {
      console.error('Error fetching portfolio mode in onboarding:', error);
      // Default to aggregation mode on error  
      setPortfolioMode('aggregation');
    } finally {
      setModeChecked(true);
    }
  };

  const nextStep = async () => {
    const currentIndex = ONBOARDING_STEPS.indexOf(currentStep);
    
    if (currentIndex < ONBOARDING_STEPS.length - 1) {
      let next = ONBOARDING_STEPS[currentIndex + 1];
      
      // If personalization already exists, skip personalization steps
      if (hasPersonalization) {
        while (next === "personalization" || next === "personalization_success") {
          const idx = ONBOARDING_STEPS.indexOf(next);
          next = ONBOARDING_STEPS[Math.min(idx + 1, ONBOARDING_STEPS.length - 1)];
        }
      }
      
      // FEATURE FLAG ROUTING:
      // - Aggregation mode: Skip KYC, jump to plaid_connection
      // - Brokerage mode: Do KYC, skip plaid_connection
      // - Hybrid mode: Do KYC first, then plaid_connection
      
      if (portfolioMode === 'aggregation') {
        // In aggregation mode: skip ALL KYC steps, jump directly to plaid_connection
        if (next === "contact" || next === "personal" || next === "financial" || next === "disclosures" || next === "agreements") {
          setCurrentStep("plaid_connection");
          return;
        }
        // After plaid_connection, when trying to go to "loading"
        if (currentStep === "plaid_connection" && next === "loading") {
          // Save onboarding as completed with Plaid timestamp
          await submitOnboardingData();
          return; // submitOnboardingData will set currentStep to "loading"
        }
      } else if (portfolioMode === 'brokerage') {
        // In brokerage mode: skip plaid_connection, go straight to loading after agreements
        if (next === "plaid_connection") {
          next = ONBOARDING_STEPS[ONBOARDING_STEPS.indexOf(next) + 1]; // Skip to loading
        }
      } else if (portfolioMode === 'hybrid') {
        // In hybrid mode: After plaid_connection, save plaid completion and navigate to /invest
        if (currentStep === "plaid_connection" && next === "loading") {
          console.log('[OnboardingFlow] Hybrid mode - saving Plaid completion and navigating to /invest');
          // Save Plaid completion timestamp
          await saveOnboardingData(
            userId,
            onboardingData,
            'submitted', // Keep status as submitted (already set from brokerage)
            undefined, // No new Alpaca data
            'plaid' // Set plaid_connection_completed_at timestamp
          );
          // Navigate directly to /invest (don't show loading screen again)
          router.push('/invest');
          return;
        }
      }
      // Natural sequence follows for remaining steps
      
      setCurrentStep(next);
    }
  };

  const prevStep = () => {
    const currentIndex = ONBOARDING_STEPS.indexOf(currentStep);
    
    if (currentIndex > 0) {
      let prev = ONBOARDING_STEPS[currentIndex - 1];
      // If personalization already exists, skip back over personalization steps
      if (hasPersonalization) {
        while (prev === "personalization_success" || prev === "personalization") {
          const idx = ONBOARDING_STEPS.indexOf(prev);
          prev = ONBOARDING_STEPS[Math.max(idx - 1, 0)];
        }
      }
      // In aggregation mode, skip back over KYC steps if going back from plaid_connection
      if (portfolioMode === 'aggregation' && currentStep === 'plaid_connection') {
        // Jump back to personalization_success
        setCurrentStep('personalization_success');
        return;
      }
      // In brokerage mode, skip plaid_connection when going back
      if (prev === "plaid_connection" && portfolioMode === 'brokerage') {
        const idx = ONBOARDING_STEPS.indexOf(prev);
        prev = ONBOARDING_STEPS[Math.max(idx - 1, 0)];
      }
      setCurrentStep(prev);
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
      await nextStep();
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
      
      // Skip Alpaca account creation in aggregation mode (Plaid-only onboarding)
      if (portfolioMode === 'aggregation') {
        console.log('🎯 [Aggregation Mode] Saving onboarding completion with plaid timestamp');
        // Save onboarding status as completed with Plaid completion timestamp
        await saveOnboardingData(
          userId,
          onboardingData,
          'submitted', // Mark as completed for aggregation mode
          undefined, // No Alpaca data
          'plaid' // Set plaid_connection_completed_at timestamp
        );
        
        console.log('✅ [Aggregation Mode] Onboarding saved, navigating to /invest');
        setAccountCreated(true);
        setSubmitting(false);
        handleLoadingComplete();
        return;
      }
      
      // Create the Alpaca account (brokerage/hybrid mode)
      const result = await createAlpacaAccount(onboardingData);
      
      if (result.error) {
        // Handle EMAIL_EXISTS error specifically (after account closure)
        if (result.code === "EMAIL_EXISTS") {
          setSubmissionError(result.error);
          setSubmitting(false);
          // Do not navigate away on error
          return;
        }
        
        // Handle the account already exists case as a success (for other scenarios)
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
          // For existing accounts, skip polling and go straight to completion
          handleLoadingComplete();
          return;
        }
        
        // Handle other errors
        setSubmissionError(result.error);
        setSubmitting(false);
        // Do not navigate away on error
        return;
      }
      
      // Save onboarding status to mark as completed with Brokerage completion timestamp
      await saveOnboardingData(
        userId,
        onboardingData,
        'submitted', // Set status to 'submitted' in database
        {
          accountId: result.data?.id,
          accountNumber: result.data?.account_number,
          accountStatus: result.data?.status
        },
        'brokerage' // Set brokerage_account_completed_at timestamp
      );
      
      setAccountCreated(true);
      setCreatedAccountId(result.data?.id); // Store account ID for status polling
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
    // After onboarding completion, determine next step based on mode
    console.log('[OnboardingFlow] handleLoadingComplete called, portfolioMode:', portfolioMode);
    
    // In hybrid mode, after brokerage account is created, show Plaid connection
    if (portfolioMode === 'hybrid') {
      console.log('[OnboardingFlow] Hybrid mode - proceeding to Plaid connection');
      setCurrentStep('plaid_connection');
      return;
    }
    
    // In aggregation or brokerage mode, go straight to /invest
    console.log('[OnboardingFlow] Navigating to /invest');
    router.push('/invest');
  };

  const handleLoadingError = (error: string) => {
    // If account creation fails during polling, return user to agreements step with error
    setSubmissionError(error);
    setSubmitting(false);
    setCurrentStep("agreements");
  };

  const renderCurrentStep = () => {
    // Block rendering until both personalization and portfolio mode checks complete to avoid flicker
    if (!personalizationChecked || !modeChecked) {
      return null;
    }
    switch (currentStep) {
      case "welcome":
        return <WelcomePage onContinue={nextStep} firstName={personalizationData.firstName} />;
      case "personalization":
        return (
          <PersonalizationStep 
            data={personalizationData} 
            onUpdate={updatePersonalizationData} 
            onContinue={() => setCurrentStep("personalization_success")}
            onProgressUpdate={(step, total) => {
              setPersonalizationStep(step);
              setPersonalizationTotalSteps(total);
            }}
          />
        );
      case "personalization_success":
        return <PersonalizationSuccess onComplete={nextStep} />;
      case "plaid_connection":
        return (
          <PlaidConnectionStep 
            onComplete={nextStep}
            onBack={prevStep}
          />
        );
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
        return (
          <OnboardingSuccessLoading 
            accountId={createdAccountId || undefined}
            onComplete={handleLoadingComplete} 
            onError={handleLoadingError}
          />
        );
      case "success":
        // This step is no longer used, navigation happens directly
        return null;
      default:
        return <WelcomePage onContinue={nextStep} />;
    }
  };

  // Calculate progress percentage
  const calculateProgress = () => {
    // Custom calculation for the success step to show 100%
    if (currentStep === "success") {
      return 100;
    }
    
    // For personalization, welcome and loading steps, show 0%
    if (currentStep === "personalization" || currentStep === "welcome" || currentStep === "loading") {
      return 0;
    }
    
    // For other steps, calculate percentage based on step index
    const currentStepIndex = stepToIndex[currentStep];
    // Adjust for welcome, personalization, and personalization_success being excluded from progress
    const adjustedIndex = currentStepIndex - 2; // Subtract welcome (0) and personalization_success (2) to make contact show as step 1
    return Math.round((adjustedIndex / totalSteps) * 100);
  };

  return (
    <div className="flex flex-col w-full">
      <div className="w-full max-w-2xl mx-auto pt-2 sm:pt-5">
        {/* Progress bar - ONLY show for personalization and KYC steps (not plaid_connection) */}
        {(currentStep === "personalization" || 
          (currentStep === "contact" || currentStep === "personal" || currentStep === "financial" || currentStep === "disclosures" || currentStep === "agreements")) && (
          <div className="mb-3 sm:mb-6">
            <ProgressBar 
              currentStep={currentStep === "personalization" ? (personalizationStep + 1) : (stepToIndex[currentStep] - 2)} // 1-based for display
              totalSteps={currentStep === "personalization" ? personalizationTotalSteps : totalSteps} // Use personalization total or KYC total
              stepNames={currentStep === "personalization" 
                ? ["Name", "Goals", "Risk", "Timeline", "Experience", "Monthly Goal", "Interests"] // Personalization step names
                : ONBOARDING_STEPS
                    .filter(step => step !== "personalization" && step !== "personalization_success" && step !== "welcome" && step !== "loading" && step !== "success" && step !== "plaid_connection")
                    .map(step => STEP_DISPLAY_NAMES[step])
              }
              percentComplete={currentStep === "personalization" 
                ? Math.round(((personalizationStep + 1) / personalizationTotalSteps) * 100)
                : calculateProgress()
              }
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