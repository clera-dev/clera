import { createClient } from '@/utils/supabase/client';

export interface ClosureData {
  confirmationNumber?: string;
  initiatedAt?: string;
  estimatedCompletion?: string;
  bankAccount?: string;
  nextSteps?: string[];
}

export interface ClosureStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  error?: string;
}

export interface ClosureState {
  steps: ClosureStep[];
  currentStep: number;
  error?: string;
  canCancel: boolean;
  isProcessing: boolean;
  isComplete: boolean;
}

export interface ProgressResponse {
  confirmation_number?: string;
  initiated_at?: string;
  current_step?: string;
  steps_completed?: number;
  status_details?: {
    error?: string;
    reason?: string;
  };
}

export interface RetryResponse {
  success: boolean;
  action_taken?: string;
  can_retry?: boolean;
  next_retry_in_seconds?: number;
}

/**
 * Service class for account closure operations
 * Handles all API calls and business logic related to account closure
 */
export class AccountClosureService {
  private static instance: AccountClosureService;

  public static getInstance(): AccountClosureService {
    if (!AccountClosureService.instance) {
      AccountClosureService.instance = new AccountClosureService();
    }
    return AccountClosureService.instance;
  }

  private constructor() {}

  /**
   * Get account ID for a user from Supabase
   */
  private async getAccountId(userId: string): Promise<string | null> {
    const supabase = createClient();
    const { data: onboardingData } = await supabase
      .from('user_onboarding')
      .select('alpaca_account_id')
      .eq('user_id', userId)
      .single();
    
    return onboardingData?.alpaca_account_id || null;
  }

  /**
   * Fetch closure data from the API
   */
  async fetchClosureData(): Promise<ClosureData | null> {
    try {
      const response = await fetch('/api/account-closure/data');
      
      if (!response.ok) {
        console.error('[AccountClosureService] Failed to fetch closure data:', response.status);
        return null;
      }
      
      const result = await response.json();
      
      if (result.success) {
        // CRITICAL FIX: Handle the case where data is null (no closure activity)
        if (result.data === null) {
          return null;
        }
        
        if (result.data) {
          return {
            confirmationNumber: result.data.confirmationNumber,
            initiatedAt: result.data.initiatedAt,
            estimatedCompletion: result.data.estimatedCompletion,
            nextSteps: result.data.nextSteps
          };
        }
      }
      
      return null;
    } catch (error) {
      console.error('[AccountClosureService] Error fetching closure data:', error);
      return null;
    }
  }

  /**
   * Fetch closure progress from the API
   */
  async fetchClosureProgress(userId: string): Promise<ProgressResponse | null> {
    try {
      const accountId = await this.getAccountId(userId);
      
      if (!accountId) {
        console.warn('[AccountClosureService] No account ID found for progress polling');
        return null;
      }
      
      const response = await fetch(`/api/account-closure/progress/${accountId}`);
      
      if (!response.ok) {
        // Don't log raw response text to prevent PII exposure
        console.error(`[AccountClosureService] Progress API responded with status ${response.status}`);
        return null;
      }
      
      const progressData = await response.json();
      return progressData;
    } catch (error) {
      console.error('[AccountClosureService] Error fetching closure progress:', error);
      return null;
    }
  }

  /**
   * Retry/resume account closure process
   */
  async retryClosureProcess(userId: string): Promise<RetryResponse> {
    try {
      const accountId = await this.getAccountId(userId);
      
      if (!accountId) {
        console.error('[AccountClosureService] No account ID found for retry');
        return { success: false };
      }
      
      const response = await fetch(`/api/account-closure/resume/${accountId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({})
      });
      
      if (!response.ok) {
        // Don't log raw error text to prevent PII exposure
        console.error('[AccountClosureService] Resume endpoint failed:', response.status);
        return { success: false };
      }
      
      return await response.json();
    } catch (error) {
      console.error('[AccountClosureService] Error during retry/resume:', error);
      return { success: false };
    }
  }

  /**
   * Map backend step to frontend step index
   */
  mapBackendStepToIndex(backendStep: string): number {
    // Normalize backend step name to lowercase to handle uppercase names from backend
    const normalizedStep = backendStep.toLowerCase();
    const stepMapping: Record<string, number> = {
      'initiated': 0,
      'liquidating_positions': 1,
      'liquidating': 1, // Support both possible keys
      'waiting_settlement': 2,
      'settlement': 2, // Support both possible keys
      'withdrawing_funds': 3,
      'withdrawing': 3, // Support both possible keys
      'closing_account': 4,
      'closing': 4, // Support both possible keys
      'completed': 5,
      'failed': -1
    };
    return stepMapping[normalizedStep] ?? -1;
  }

  /**
   * Update closure steps based on progress response
   */
  updateClosureSteps(currentSteps: ClosureStep[], progressData: ProgressResponse): ClosureStep[] {
    const updatedSteps = [...currentSteps];
    
    if (!progressData.current_step) {
      return updatedSteps;
    }
    
    if (progressData.current_step.toLowerCase() === 'failed') {
      // Handle failed state
      // Fix off-by-one: failedStepIndex should be steps_completed (not steps_completed + 1)
      const failedStepIndex = Math.max(0, progressData.steps_completed || 0);
      
      // Mark completed steps
      for (let i = 0; i < failedStepIndex && i < updatedSteps.length; i++) {
        updatedSteps[i].status = 'completed';
      }
      
      // Mark failed step
      if (failedStepIndex < updatedSteps.length) {
        updatedSteps[failedStepIndex].status = 'failed';
        
        let errorMessage = 'Process failed - please contact support';
        if (progressData.status_details?.error) {
          errorMessage = progressData.status_details.error;
        } else if (progressData.status_details?.reason) {
          errorMessage = progressData.status_details.reason;
        }
        
        updatedSteps[failedStepIndex].error = errorMessage;
      }
      
      // Mark remaining steps as pending
      for (let i = failedStepIndex + 1; i < updatedSteps.length; i++) {
        updatedSteps[i].status = 'pending';
      }
    } else {
      const currentStepIndex = this.mapBackendStepToIndex(progressData.current_step);
      
      if (currentStepIndex >= 0) {
        // Mark previous steps as completed
        for (let i = 0; i < currentStepIndex && i < updatedSteps.length; i++) {
          updatedSteps[i].status = 'completed';
        }
        
        // Mark current step
        if (currentStepIndex < updatedSteps.length) {
          if (progressData.current_step.toLowerCase() === 'completed') {
            // Mark all steps as completed
            for (let i = 0; i < updatedSteps.length; i++) {
              updatedSteps[i].status = 'completed';
            }
          } else {
            updatedSteps[currentStepIndex].status = 'in-progress';
          }
        }
        
        // Mark remaining steps as pending
        for (let i = currentStepIndex + 1; i < updatedSteps.length; i++) {
          updatedSteps[i].status = 'pending';
        }
      }
    }
    
    return updatedSteps;
  }

  /**
   * Get initial closure steps
   */
  getInitialClosureSteps(): ClosureStep[] {
    return [
      {
        id: 'verify',
        title: 'Verifying account can be closed safely',
        description: 'Checking account status and requirements',
        status: 'completed'
      },
      {
        id: 'liquidate',
        title: 'Liquidating positions and canceling orders',
        description: 'Selling all holdings and canceling any pending orders',
        status: 'pending'
      },
      {
        id: 'settlement',
        title: 'Waiting for settlement',
        description: 'T+1 settlement period for all transactions',
        status: 'pending'
      },
      {
        id: 'withdraw',
        title: 'Withdrawing remaining funds',
        description: 'Transferring all cash to your connected bank account',
        status: 'pending'
      },
      {
        id: 'close',
        title: 'Closing account',
        description: 'Final account closure and confirmation',
        status: 'pending'
      }
    ];
  }
}

// Export singleton instance
export const accountClosureService = AccountClosureService.getInstance(); 