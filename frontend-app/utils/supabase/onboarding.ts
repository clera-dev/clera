import { createClient } from './server';
import { OnboardingData } from '@/components/onboarding/OnboardingTypes';

export type OnboardingStatus = 'not_started' | 'in_progress' | 'submitted' | 'approved' | 'rejected' | 'pending_closure' | 'closed';

export type UserOnboardingRecord = {
  id?: string;
  user_id: string;
  status: OnboardingStatus;
  onboarding_data: OnboardingData;
  created_at?: string;
  updated_at?: string;
  alpaca_account_id?: string;
  alpaca_account_number?: string;
  alpaca_account_status?: string;
};

export async function saveOnboardingData(
  userId: string, 
  onboardingData: OnboardingData, 
  status: OnboardingStatus = 'in_progress',
  alpacaData?: {
    accountId?: string;
    accountNumber?: string;
    accountStatus?: string;
  }
): Promise<{ success: boolean; error?: string }> {
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
    
    return { success: true };
  } catch (error) {
    console.error('Error saving onboarding data:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

export async function getOnboardingData(userId: string): Promise<{
  data?: UserOnboardingRecord;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from('user_onboarding')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (error) throw error;
    
    return { data: data as UserOnboardingRecord };
  } catch (error) {
    // If no record exists, don't treat as an error
    if ((error as any)?.code === 'PGRST116') {
      return { data: undefined };
    }
    
    console.error('Error fetching onboarding data:', error);
    return { 
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
} 