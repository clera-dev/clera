"use client";

import { OnboardingData, OnboardingStatus } from "@/lib/types/onboarding";
import { saveOnboardingDataAction, getOnboardingDataAction } from "@/app/actions";

// Client-side wrapper for saving onboarding data
export async function saveOnboardingData(
  userId: string,
  onboardingData: OnboardingData,
  status: OnboardingStatus = 'in_progress',
  alpacaData?: {
    accountId?: string;
    accountNumber?: string;
    accountStatus?: string;
  },
  completionType?: 'plaid' | 'brokerage' | null
) {
  // Log data for debugging
  console.log('Saving onboarding data:', { alpacaData, completionType });
  
  // Store Alpaca account ID in localStorage for immediate use
  if (alpacaData?.accountId) {
    try {
      localStorage.setItem('alpacaAccountId', alpacaData.accountId);
      console.log('Stored Alpaca account ID in localStorage:', alpacaData.accountId);
    } catch (e) {
      console.error('Error storing Alpaca account ID in localStorage:', e);
    }
  }
  
  return saveOnboardingDataAction(userId, onboardingData, status, alpacaData, completionType);
}

// Client-side wrapper for getting onboarding data
// This would typically be used in server components directly, but included here for completeness
export async function getOnboardingData(userId: string) {
  return getOnboardingDataAction(userId);
} 