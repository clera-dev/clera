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
import TermsConditionsStep from "./TermsConditionsStep";
import AgreementsStep from "./AgreementsStep";
import OnboardingSuccessLoading from "./OnboardingSuccessLoading";
import PersonalizationSuccess from "./PersonalizationSuccess";
import SnapTradeConnectionStep from "./SnapTradeConnectionStep";
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
type Step = "welcome" | "personalization" | "personalization_success" | "plaid_connection" | "contact" | "personal" | "financial" | "disclosures" | "terms_conditions" | "agreements" | "loading" | "success";

// Single source of truth for step sequence
// 
// CURRENT STATE (Jan 2025): Only AGGREGATION mode is actively used.
// Brokerage/hybrid modes are deprecated and may be re-enabled in 6-12+ months.
// The aggregation flow is: welcome → personalization (7 steps) → terms_conditions → 
// personalization_success → plaid_connection (SnapTrade) → portfolio
//
// LEGACY NOTES (for future reference if brokerage/hybrid are re-enabled):
// - In hybrid mode, brokerage (KYC) comes FIRST, then connection
// - terms_conditions = Clera SEC-required disclosures (Form CRS, ADV, etc.)
// - agreements = Alpaca brokerage agreement (only for brokerage/hybrid mode)
// - plaid_connection is legacy naming, now uses SnapTrade for brokerage connections
const ONBOARDING_STEPS: Step[] = [
  "welcome",
  "personalization",
  "personalization_success",
  "contact",            // KYC - skipped in aggregation mode
  "personal",           // KYC - skipped in aggregation mode
  "financial",          // KYC - skipped in aggregation mode
  "disclosures",        // KYC - skipped in aggregation mode
  "terms_conditions",   // Clera SEC disclosures - ALWAYS shown
  "agreements",         // Alpaca brokerage agreement - skipped in aggregation mode
  "plaid_connection",   // SnapTrade brokerage connection (legacy naming)
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
  "terms_conditions": "Terms & Conditions",
  "agreements": "Brokerage Agreement",
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
  TermsConditions = 7,
  Agreements = 8,
  PlaidConnection = 9,  // Plaid comes AFTER KYC in the sequence
  Loading = 10,
  Success = 11
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
        setPortfolioMode(data.portfolio_mode || 'brokerage');  // Default to brokerage if unset
      } else {
        // ARCHITECTURE FIX: Fail closed - default to brokerage mode which requires KYC
        // Defaulting to aggregation would skip compliance checks for brokerage/hybrid users
        // This ensures all users go through proper onboarding unless explicitly in aggregation
        console.warn('Portfolio mode API call failed, defaulting to brokerage for safety');
        setPortfolioMode('brokerage');
      }
    } catch (error) {
      console.error('Error fetching portfolio mode in onboarding:', error);
      // ARCHITECTURE FIX: Fail closed - default to brokerage mode on error
      // This ensures compliance checks are not bypassed during transient failures
      setPortfolioMode('brokerage');
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
      // - Aggregation mode: Skip KYC (contact/personal/financial/disclosures), but KEEP terms_conditions, skip agreements, jump to plaid_connection
      // - Brokerage mode: Do KYC, skip plaid_connection
      // - Hybrid mode: Do KYC first, then plaid_connection
      
      if (portfolioMode === 'aggregation') {
        // In aggregation mode: skip KYC steps but KEEP terms_conditions (SEC requirement)
        if (next === "contact" || next === "personal" || next === "financial" || next === "disclosures") {
          setCurrentStep("terms_conditions"); // Jump to Clera terms & conditions
          return;
        }
        // Skip Alpaca agreements in aggregation mode (no brokerage account)
        if (next === "agreements") {
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
      // In hybrid mode: After connection, save completion and check payment before /portfolio
        if (currentStep === "plaid_connection" && next === "loading") {
          console.log('[OnboardingFlow] Hybrid mode - saving connection completion and checking payment');
          try {
            // Save connection completion timestamp (aggregation-style completion)
            await saveOnboardingData(
              userId,
              onboardingData,
              'submitted', // Keep status as submitted (already set from brokerage)
              undefined, // No new Alpaca data
              'aggregation' // Sets connection completion timestamp
            );
            // Check payment before navigating (consistent with other modes)
            await redirectToCheckoutOrPortfolio('Hybrid mode connection complete');
          } catch (error) {
            console.error('[OnboardingFlow] Hybrid mode payment redirect failed:', error);
            router.push('/portfolio');
          }
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
      // In aggregation mode, skip back over KYC steps and agreements
      if (portfolioMode === 'aggregation') {
        // From plaid_connection, go back to terms_conditions (skip agreements)
        if (currentStep === 'plaid_connection') {
          setCurrentStep('terms_conditions');
          return;
        }
        // From terms_conditions, go back to personalization (step 7)
        if (currentStep === 'terms_conditions') {
          setCurrentStep('personalization');
          return;
        }
      }
      // In brokerage mode, skip plaid_connection when going back
      if (prev === "plaid_connection" && portfolioMode === 'brokerage') {
        const idx = ONBOARDING_STEPS.indexOf(prev);
        prev = ONBOARDING_STEPS[Math.max(idx - 1, 0)];
      }
      // Skip agreements step when going back in aggregation mode
      if (prev === "agreements" && portfolioMode === 'aggregation') {
        prev = "terms_conditions";
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
        console.log('🎯 [Aggregation Mode] Saving onboarding completion with connection timestamp');
        // Save onboarding status as completed with connection completion timestamp
        await saveOnboardingData(
          userId,
          onboardingData,
          'submitted', // Mark as completed for aggregation mode
          undefined, // No Alpaca data
          'aggregation' // Set connection completion timestamp
        );
        
        console.log('✅ [Aggregation Mode] Onboarding saved, navigating to /portfolio');
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

  const redirectToCheckoutOrPortfolio = async (context: string) => {
    console.log(`[OnboardingFlow] ${context} - attempting to create checkout session`);
    
    try {
      const checkoutResponse = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (checkoutResponse.ok) {
        const checkoutData = await checkoutResponse.json();
        if (checkoutData.url) {
          window.location.href = checkoutData.url;
          return;
        }
        console.log('[OnboardingFlow] No checkout URL received, allowing portfolio browsing');
        router.push('/portfolio');
        return;
      }

      if (checkoutResponse.status === 409) {
        const errorData = await checkoutResponse.json();
        console.log('[OnboardingFlow] User already has subscription, redirecting to portfolio');
        router.push(errorData.redirectTo || '/portfolio');
        return;
      }

      // Checkout failed - allow user to browse portfolio anyway
      // The portfolio page will show prompts to connect accounts or subscribe
      console.log('[OnboardingFlow] Checkout unavailable, allowing portfolio browsing');
      router.push('/portfolio');
    } catch (error) {
      console.error('[OnboardingFlow] Error creating checkout session:', error);
      // On error, let user browse portfolio
      router.push('/portfolio');
    }
  };

  const handleLoadingComplete = async () => {
    // After onboarding completion, determine next step based on mode
    console.log('[OnboardingFlow] handleLoadingComplete called, portfolioMode:', portfolioMode);
    
    // In hybrid mode, after brokerage account is created, show Plaid connection
    if (portfolioMode === 'hybrid') {
      console.log('[OnboardingFlow] Hybrid mode - proceeding to Plaid connection');
      setCurrentStep('plaid_connection');
      return;
    }
    
    // Check payment status and attempt checkout if needed
    // If checkout fails, still allow user to browse /portfolio
    // The portfolio page will show prompts to connect accounts or subscribe
    try {
      const paymentCheck = await fetch('/api/stripe/check-payment-status');
      if (paymentCheck.ok) {
        const paymentData = await paymentCheck.json();
        
        if (paymentData.hasActivePayment) {
          // User has already paid - go directly to portfolio
          console.log('[OnboardingFlow] User has active payment, redirecting to portfolio');
          router.push('/portfolio');
        } else {
          // User needs to pay - attempt Stripe checkout, fallback to portfolio browsing
          await redirectToCheckoutOrPortfolio('User needs payment');
        }
      } else {
        // Payment check failed - allow user to browse portfolio
        console.log('[OnboardingFlow] Payment check failed, allowing portfolio browsing');
        router.push('/portfolio');
      }
    } catch (error) {
      console.error('[OnboardingFlow] Error checking payment status:', error);
      // Fallback to portfolio - page-level prompts will guide user
      router.push('/portfolio');
    }
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
            // In aggregation mode, go directly to terms_conditions (skip success screen)
            // Success screen will show AFTER terms are accepted and data is saved
            onContinue={() => setCurrentStep(portfolioMode === 'aggregation' ? "terms_conditions" : "personalization_success")}
            onProgressUpdate={(step, total) => {
              setPersonalizationStep(step);
              setPersonalizationTotalSteps(total);
            }}
            // In aggregation mode, show 8 total steps (7 personalization + 1 terms)
            displayTotalSteps={portfolioMode === 'aggregation' ? 8 : undefined}
          />
        );
      case "personalization_success":
        // NOTE: Currently only aggregation mode is actively used (brokerage/hybrid are deprecated)
        // In aggregation mode, this shows AFTER terms & conditions (data saved)
        // Then continues to SnapTrade connection (plaid_connection is legacy naming)
        // TODO: If brokerage/hybrid modes are re-enabled, this routing needs to be updated
        // to call nextStep() for those modes to continue through KYC/agreements flow
        return <PersonalizationSuccess onComplete={() => setCurrentStep("plaid_connection")} />;
      case "plaid_connection":
        return (
          <SnapTradeConnectionStep 
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
      case "terms_conditions":
        // NOTE: Currently only aggregation mode is actively used (brokerage/hybrid are deprecated)
        // After saving data, show success screen then go to SnapTrade connection
        // TODO: If brokerage/hybrid modes are re-enabled, this routing needs to be updated
        // to continue through agreements/KYC flow for those modes
        return (
          <TermsConditionsStep 
            data={onboardingData}
            personalizationData={personalizationData}
            onUpdate={updateData} 
            onContinue={() => setCurrentStep("personalization_success")} 
            onBack={prevStep}
          />
        );
      case "agreements":
        // Alpaca brokerage agreement - only shown in brokerage/hybrid mode
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
        {/* Progress bar - Unified 8-step flow for aggregation mode (7 personalization + 1 terms) */}
        {/* In aggregation mode: show continuous progress bar for personalization AND terms_conditions */}
        {portfolioMode === 'aggregation' && (currentStep === "personalization" || currentStep === "terms_conditions") && (
          <div className="mb-3 sm:mb-6">
            <ProgressBar 
              currentStep={currentStep === "personalization" ? (personalizationStep + 1) : 8}
              totalSteps={8}
              stepNames={["Name", "Goals", "Risk", "Timeline", "Experience", "Monthly Goal", "Interests", "Terms"]}
              percentComplete={currentStep === "personalization" 
                ? Math.round(((personalizationStep + 1) / 8) * 100)
                : 100
              }
            />
          </div>
        )}
        
        {/* Progress bar for brokerage/hybrid mode - separate personalization and KYC flows */}
        {portfolioMode !== 'aggregation' && currentStep === "personalization" && (
          <div className="mb-3 sm:mb-6">
            <ProgressBar 
              currentStep={personalizationStep + 1}
              totalSteps={personalizationTotalSteps}
              stepNames={["Name", "Goals", "Risk", "Timeline", "Experience", "Monthly Goal", "Interests"]}
              percentComplete={Math.round(((personalizationStep + 1) / personalizationTotalSteps) * 100)}
            />
          </div>
        )}
        
        {/* Progress bar for KYC steps (only in brokerage/hybrid mode) */}
        {portfolioMode !== 'aggregation' && 
          (currentStep === "contact" || currentStep === "personal" || currentStep === "financial" || currentStep === "disclosures" || currentStep === "terms_conditions" || currentStep === "agreements") && (
          <div className="mb-3 sm:mb-6">
            <ProgressBar 
              currentStep={stepToIndex[currentStep] - 2}
              totalSteps={totalSteps}
              stepNames={ONBOARDING_STEPS
                .filter(step => step !== "personalization" && step !== "personalization_success" && step !== "welcome" && step !== "loading" && step !== "success" && step !== "plaid_connection" && step !== "agreements")
                .map(step => STEP_DISPLAY_NAMES[step])
              }
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