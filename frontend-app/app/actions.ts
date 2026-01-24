"use server";

import { encodedRedirect } from "@/utils/utils";
import { createClient } from "@/utils/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { OnboardingData, OnboardingStatus } from "@/lib/types/onboarding";
import { getRedirectPathWithServerTransferLookup } from "@/lib/utils/userRouting";

/**
 * Waits for auth state to be consistent after authentication operations.
 * Uses exponential backoff with a maximum of 3 retries to avoid infinite loops.
 * 
 * @param supabase - The Supabase client instance
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param baseDelay - Base delay in milliseconds (default: 100)
 * @returns Promise that resolves when auth state is consistent or rejects after max retries
 */
async function waitForAuthStateConsistency(
  supabase: any, 
  maxRetries: number = 3, 
  baseDelay: number = 100
): Promise<any> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error) {
        throw new Error(`Auth error on attempt ${attempt + 1}: ${error.message}`);
      }
      
      if (user) {
        // Auth state is consistent, return the user
        return user;
      }
      
      // If no user found and this isn't the last attempt, wait and retry
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
        console.log(`Auth state not ready, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw new Error(`Auth state not consistent after ${maxRetries + 1} attempts`);
      }
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      // For non-auth errors, still retry with exponential backoff
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`Auth check failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error('Auth state consistency check failed');
}



// Password validation requirements (must match client-side)
const PASSWORD_REQUIREMENTS = [
  { label: "At least 8 characters", test: (password: string) => password.length >= 8 },
  { label: "Contains a number", test: (password: string) => /\d/.test(password) },
  { label: "Contains a lowercase letter", test: (password: string) => /[a-z]/.test(password) },
  { label: "Contains an uppercase letter", test: (password: string) => /[A-Z]/.test(password) },
];

function validatePassword(password: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const requirement of PASSWORD_REQUIREMENTS) {
    if (!requirement.test(password)) {
      errors.push(requirement.label);
    }
  }
  return { isValid: errors.length === 0, errors };
}

export const signUpAction = async (formData: FormData) => {
  const email = formData.get("email")?.toString();
  const password = formData.get("password")?.toString();
  const supabase = await createClient();
  const origin = (await headers()).get("origin");

  if (!email || !password) {
    return encodedRedirect(
      "error",
      "/sign-up",
      "Email and password are required",
    );
  }

  // Server-side password validation (fallback if client validation is bypassed)
  const { isValid, errors } = validatePassword(password);
  if (!isValid) {
    const friendlyMessage = `Password must have: ${errors.join(", ").toLowerCase()}`;
    return encodedRedirect("error", "/sign-up", friendlyMessage);
  }

  console.log("Attempting to sign up user with email:", email);
  console.log("Email redirect URL:", `${origin}/auth/callback`);
  
  // First attempt to sign up
  const { error, data } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    console.error("Sign-up error details:", error.code, error.message, error);
    // Provide user-friendly error messages instead of raw Supabase errors
    let friendlyMessage = error.message;
    if (error.message.toLowerCase().includes("password")) {
      friendlyMessage = "Password doesn't meet security requirements. Please ensure it has at least 8 characters, includes uppercase and lowercase letters, and contains a number.";
    } else if (error.message.toLowerCase().includes("email")) {
      friendlyMessage = "Please enter a valid email address.";
    } else if (error.message.toLowerCase().includes("already registered") || error.message.toLowerCase().includes("already exists")) {
      friendlyMessage = "An account with this email already exists. Please sign in instead.";
    }
    return encodedRedirect("error", "/sign-up", friendlyMessage);
  } else {
    console.log("Sign-up successful");
    
    // Since email verification is not enforced, automatically sign in after signup
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (signInError) {
      console.error("Auto sign-in after signup failed:", signInError);
      return encodedRedirect("error", "/sign-in", "Signup was successful, but automatic login failed. Please sign in manually.");
    }
    
    // Wait for auth state to be consistent using proper retry mechanism
    let user;
    try {
      user = await waitForAuthStateConsistency(supabase);
    } catch (authError) {
      console.error("Failed to get consistent auth state after signup:", authError);
      return encodedRedirect("error", "/sign-in", "Signup successful, but there was an issue with the login. Please sign in manually.");
    }
    
    if (user) {
      // Check onboarding status with explicit null/error handling
      const { data: onboardingData, error: onboardingError } = await supabase
        .from('user_onboarding')
        .select('status')
        .eq('user_id', user.id)
        .maybeSingle();
      if (onboardingError && onboardingError.code !== 'PGRST116') {
        console.warn('Onboarding status lookup error:', onboardingError);
      }
      const userStatus = onboardingData ? onboardingData.status : undefined;
      
      // ARCHITECTURAL FIX: Use centralized routing logic with proper server-side transfer lookup
      // This eliminates duplicate Supabase queries and maintains proper client/server separation
      const redirectPath = await getRedirectPathWithServerTransferLookup(userStatus, user.id, supabase);
      return redirect(redirectPath);
    }
    
    // Default: redirect to protected route to start onboarding
    return redirect("/protected");
  }
};

export const signInAction = async (formData: FormData) => {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return encodedRedirect("error", "/sign-in", error.message);
  }

  // Wait for auth state to be consistent using proper retry mechanism
  let user;
  try {
    user = await waitForAuthStateConsistency(supabase);
  } catch (authError) {
    console.error("Failed to get consistent auth state after signin:", authError);
    return encodedRedirect("error", "/sign-in", "Sign in successful, but there was an issue with the session. Please try signing in again.");
  }
  
  if (user) {
    // Check onboarding status with explicit null/error handling
    const { data: onboardingData, error: onboardingError } = await supabase
      .from('user_onboarding')
      .select('status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (onboardingError && onboardingError.code !== 'PGRST116') {
      console.warn('Onboarding status lookup error:', onboardingError);
    }
    const userStatus = onboardingData ? onboardingData.status : undefined;
    
    // ARCHITECTURAL FIX: Use centralized routing logic with proper server-side transfer lookup
    // This eliminates duplicate Supabase queries and maintains proper client/server separation
    const redirectPath = await getRedirectPathWithServerTransferLookup(userStatus, user.id, supabase);
    return redirect(redirectPath);
  }

  // Default: go to protected page for onboarding or funding
  return redirect("/protected");
};

export const forgotPasswordAction = async (formData: FormData) => {
  const email = formData.get("email")?.toString();
  const supabase = await createClient();
  const origin = (await headers()).get("origin");
  const callbackUrl = formData.get("callbackUrl")?.toString();

  if (!email) {
    return encodedRedirect("error", "/forgot-password", "Email is required");
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?redirect_to=/protected/reset-password`,
  });

  if (error) {
    console.error(error.message);
    return encodedRedirect(
      "error",
      "/forgot-password",
      "Could not reset password",
    );
  }

  if (callbackUrl) {
    return redirect(callbackUrl);
  }

  return encodedRedirect(
    "success",
    "/forgot-password",
    "Check your email for a link to reset your password.",
  );
};

export const resetPasswordAction = async (formData: FormData) => {
  const supabase = await createClient();

  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!password || !confirmPassword) {
    return encodedRedirect(
      "error",
      "/protected/reset-password",
      "Password and confirm password are required",
    );
  }

  if (password !== confirmPassword) {
    return encodedRedirect(
      "error",
      "/protected/reset-password",
      "Passwords do not match",
    );
  }

  const { error } = await supabase.auth.updateUser({
    password: password,
  });

  if (error) {
    return encodedRedirect(
      "error",
      "/protected/reset-password",
      "Password update failed",
    );
  }

  return encodedRedirect("success", "/protected/reset-password", "Password updated");
};

export const signOutAction = async () => {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return redirect("/sign-in");
};

export async function saveOnboardingDataAction(
  userId: string,
  onboardingData: OnboardingData,
  status: OnboardingStatus = 'in_progress',
  alpacaData?: {
    accountId?: string;
    accountNumber?: string;
    accountStatus?: string;
  },
  completionType?: 'plaid' | 'aggregation' | 'brokerage' | null
) {
  try {
    const supabase = await createClient();
    
    // Prepare completion timestamp based on type
    const now = new Date().toISOString();
    const completionFields: any = {};
    
    if ((completionType === 'plaid' || completionType === 'aggregation') && status === 'submitted') {
      completionFields.plaid_connection_completed_at = now;
      console.log('Setting connection_completed_at:', now);
    } else if (completionType === 'brokerage' && status === 'submitted') {
      completionFields.brokerage_account_completed_at = now;
      console.log('Setting brokerage_account_completed_at:', now);
    }
    
    // Check if record already exists for this user
    const { data: existingRecord } = await supabase
      .from('user_onboarding')
      .select('id')
      .eq('user_id', userId)
      .single();
    
    if (existingRecord) {
      // Update existing record
      const { error } = await supabase
        .from('user_onboarding')
        .update({
          status,
          onboarding_data: onboardingData,
          updated_at: now,
          ...completionFields,
          ...(alpacaData?.accountId && { alpaca_account_id: alpacaData.accountId }),
          ...(alpacaData?.accountNumber && { alpaca_account_number: alpacaData.accountNumber }),
          ...(alpacaData?.accountStatus && { alpaca_account_status: alpacaData.accountStatus }),
        })
        .eq('id', existingRecord.id);
      
      if (error) throw error;
    } else {
      // Create new record
      const { error } = await supabase
        .from('user_onboarding')
        .insert({
          user_id: userId,
          status,
          onboarding_data: onboardingData,
          created_at: now,
          updated_at: now,
          ...completionFields,
          ...(alpacaData?.accountId && { alpaca_account_id: alpacaData.accountId }),
          ...(alpacaData?.accountNumber && { alpaca_account_number: alpacaData.accountNumber }),
          ...(alpacaData?.accountStatus && { alpaca_account_status: alpacaData.accountStatus }),
        });
      
      if (error) throw error;
    }
    
    revalidatePath('/protected');
    return { success: true };
  } catch (error) {
    console.error('Error saving onboarding data:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

export async function getOnboardingDataAction(userId: string) {
  try {
    const supabase = await createClient();
    
    // Check if the table exists by attempting to get its schema
    const { error: schemaError } = await supabase
      .from('user_onboarding')
      .select('*')
      .limit(0);
    
    // If the table doesn't exist, return empty data instead of throwing an error
    if (schemaError && schemaError.code === '42P01') { // PostgreSQL error code for 'relation does not exist'
      return { data: undefined };
    }
    
    // Proceed with the regular query if the table exists
    const { data, error } = await supabase
      .from('user_onboarding')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (error) {
      // If no record exists, don't treat as an error
      if (error.code === 'PGRST116') {
        return { data: undefined };
      }
      throw error;
    }
    
    return { data };
  } catch (error) {
    console.error('Error fetching onboarding data:', error);
    // Handle the error gracefully without throwing
    return { 
      data: undefined,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}
