"use client";

import { useEffect } from "react";

interface OnboardingStatusSetterProps {
  status: string;
}

/**
 * This component is used to set the onboarding status in localStorage
 * It doesn't render anything visible
 */
export default function OnboardingStatusSetter({ status }: OnboardingStatusSetterProps) {
  useEffect(() => {
    // Store the onboarding status in localStorage
    try {
      // Store in localStorage for client-side access
      localStorage.setItem("onboardingStatus", status);
    } catch (error) {
      console.error("Error setting onboarding status:", error);
    }
  }, [status]);

  // This component doesn't render anything visible
  return null;
} 