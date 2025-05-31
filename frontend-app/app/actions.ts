"use server";

import { encodedRedirect } from "@/utils/utils";
import { createClient } from "@/utils/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { OnboardingData } from "@/components/onboarding/OnboardingTypes";

export type OnboardingStatus = 'not_started' | 'in_progress' | 'submitted' | 'approved' | 'rejected';

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
    return encodedRedirect("error", "/sign-up", error.message);
  } else {
    console.log("Sign-up successful, user data:", data);
    
    // Since email verification is not enforced, automatically sign in after signup
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (signInError) {
      console.error("Auto sign-in after signup failed:", signInError);
      return encodedRedirect("error", "/sign-in", "Signup was successful, but automatic login failed. Please sign in manually.");
    }
    
    // Get the user to check their onboarding and funding status
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      // Check onboarding status
      const { data: onboardingData } = await supabase
        .from('user_onboarding')
        .select('status')
        .eq('user_id', user.id)
        .single();
      
      const hasCompletedOnboarding = 
        onboardingData?.status === 'submitted' || 
        onboardingData?.status === 'approved';
      
      if (hasCompletedOnboarding) {
        // Check if user has funded their account (has transfers)
        const { data: transfers } = await supabase
          .from('user_transfers')
          .select('id')
          .eq('user_id', user.id)
          .limit(1);
        
        // If they have completed onboarding and have funded their account, go to portfolio
        if (transfers && transfers.length > 0) {
          return redirect("/portfolio");
        }
      }
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

  // Get the user to check their onboarding and funding status
  const { data: { user } } = await supabase.auth.getUser();
  
  if (user) {
    // Check onboarding status
    const { data: onboardingData } = await supabase
      .from('user_onboarding')
      .select('status')
      .eq('user_id', user.id)
      .single();
    
    const hasCompletedOnboarding = 
      onboardingData?.status === 'submitted' || 
      onboardingData?.status === 'approved';
    
    if (hasCompletedOnboarding) {
      // Check if user has funded their account (has transfers)
      const { data: transfers } = await supabase
        .from('user_transfers')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);
      
      // If they have completed onboarding and have funded their account, go to portfolio
      if (transfers && transfers.length > 0) {
        return redirect("/portfolio");
      }
    }
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
    encodedRedirect(
      "error",
      "/protected/reset-password",
      "Password and confirm password are required",
    );
  }

  if (password !== confirmPassword) {
    encodedRedirect(
      "error",
      "/protected/reset-password",
      "Passwords do not match",
    );
  }

  const { error } = await supabase.auth.updateUser({
    password: password,
  });

  if (error) {
    encodedRedirect(
      "error",
      "/protected/reset-password",
      "Password update failed",
    );
  }

  encodedRedirect("success", "/protected/reset-password", "Password updated");
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
  }
) {
  try {
    const supabase = await createClient();
    
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
          updated_at: new Date().toISOString(),
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
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
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
      .single();
    
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
