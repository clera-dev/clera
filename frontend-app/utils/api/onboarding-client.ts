"use client";

import { OnboardingData } from "@/components/onboarding/OnboardingTypes";
import { saveOnboardingDataAction, getOnboardingDataAction, OnboardingStatus } from "@/app/actions";

// Client-side wrapper for saving onboarding data
export async function saveOnboardingData(
  userId: string,
  onboardingData: OnboardingData,
  status: OnboardingStatus = 'in_progress',
  alpacaData?: {
    accountId?: string;
    accountNumber?: string;
    accountStatus?: string;
  }
) {
  return saveOnboardingDataAction(userId, onboardingData, status, alpacaData);
}

// Client-side wrapper for getting onboarding data
// This would typically be used in server components directly, but included here for completeness
export async function getOnboardingData(userId: string) {
  return getOnboardingDataAction(userId);
} 