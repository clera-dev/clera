

/**
 * Account Closure Service
 * 
 * ERROR LOGGING STRATEGY:
 * This service implements a comprehensive error logging strategy that balances
 * observability with production-friendly logging:
 * 
 * - Development: All errors are logged with full details for debugging
 * - Production: 
 *   * Server errors (500+) are logged as errors for backend health monitoring
 *   * Client errors (400-499) are logged as warnings to maintain observability
 *   * Network errors are logged appropriately for troubleshooting
 * 
 * This approach ensures that:
 * - Backend failures are not hidden from monitoring
 * - Error logs remain actionable and not spammy
 * - Development debugging remains effective
 * - Production observability is maintained
 */

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

export interface UserStatusResponse {
  userId: string;
  status: string | null;
  alpacaAccountId?: string | null;
  hasOnboardingData: boolean;
  createdAt?: string;
  updatedAt?: string;
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
   * Log error with appropriate level based on error type and environment
   * @param message - Error message
   * @param error - Error details
   * @param isServerError - Whether this is a server-side error (500+)
   */
  private logError(message: string, error: any, isServerError: boolean = false): void {
    // In development, log all errors for debugging
    if (process.env.NODE_ENV === 'development') {
      console.error(message, error);
      return;
    }

    // In production, use different log levels based on error type
    if (isServerError) {
      // Server errors (500+) are important for monitoring backend health
      // Log as error for observability but limit details to prevent spam
      console.error(`[AccountClosureService] ${message} (Status: ${error?.status || 'unknown'})`);
    } else {
      // Client errors (400-499) are usually user-related and less critical
      // Log as warn to maintain observability without cluttering error logs
      console.warn(`[AccountClosureService] ${message} (Status: ${error?.status || 'unknown'})`);
    }
  }

  /**
   * Get account ID for the current authenticated user using the secure API route
   * ARCHITECTURAL FIX: Uses getUserStatus() API instead of direct database query
   * NOTE: This service only works with the current session user for security
   */
  private async getAccountId(): Promise<string | null> {
    try {
      const userStatusData = await this.getUserStatus();
      
      if (!userStatusData) {
        this.logError('No user status data found for current user', {}, false);
        return null;
      }
      
      if (!userStatusData.alpacaAccountId) {
        this.logError('No alpaca_account_id found for current user', { 
          status: userStatusData.status,
          hasOnboardingData: userStatusData.hasOnboardingData 
        }, false);
        return null;
      }
      
      return userStatusData.alpacaAccountId;
    } catch (error) {
      this.logError('Exception getting account ID for current user', error, false);
      return null;
    }
  }

  /**
   * Get current user's status using the secure API route
   * ARCHITECTURAL FIX: This replaces direct client-side database queries
   * with proper API route communication following security boundaries
   */
  async getUserStatus(): Promise<UserStatusResponse | null> {
    try {
      const response = await fetch('/api/user/status');
      
      if (!response.ok) {
        // Log errors with appropriate levels
        const isServerError = response.status >= 500;
        this.logError('Failed to fetch user status', { status: response.status }, isServerError);
        return null;
      }
      
      const result = await response.json();
      return result;
    } catch (error) {
      // Network errors should be logged for observability
      this.logError('Network error fetching user status', error, false);
      return null;
    }
  }

  /**
   * Fetch closure data from the API
   */
  async fetchClosureData(signal?: AbortSignal): Promise<ClosureData | null> {
    try {
      const response = await fetch('/api/account-closure/data', {
        signal
      });
      
      if (!response.ok) {
        // Log all errors for observability, but use appropriate levels
        const isServerError = response.status >= 500;
        this.logError('Failed to fetch closure data', { status: response.status }, isServerError);
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
      // Network errors should be logged for observability
      this.logError('Network error fetching closure data', error, false);
      return null;
    }
  }

  /**
   * Fetch closure progress from the API for the current authenticated user
   * ARCHITECTURAL FIX: This service only works with the current session user
   * 
   * @param userStatusData - Optional pre-fetched user status to avoid duplicate API calls
   */
  async fetchClosureProgress(userStatusData?: UserStatusResponse | null): Promise<ProgressResponse | null> {
    try {
      let accountId: string | null = null;
      
      // Use provided user status if available to avoid duplicate API calls
      if (userStatusData !== undefined) {
        if (!userStatusData) {
          this.logError('No user status data provided - skipping progress polling', {}, false);
          return null;
        }
        
        if (!userStatusData.alpacaAccountId) {
          this.logError('No alpaca_account_id found in provided user status', { 
            status: userStatusData.status,
            hasOnboardingData: userStatusData.hasOnboardingData 
          }, false);
          return null;
        }
        
        accountId = userStatusData.alpacaAccountId;
      } else {
        // Fallback to internal getAccountId() for backward compatibility
        accountId = await this.getAccountId();
        
        if (!accountId) {
          // Don't treat this as an error - just means no progress polling available
          this.logError('No account ID found for current user - skipping progress polling', {}, false);
          return null;
        }
      }
      
      const response = await fetch(`/api/account-closure/progress/${accountId}`);
      
      if (!response.ok) {
        // Log all errors for observability, but use appropriate levels
        const isServerError = response.status >= 500;
        this.logError('Progress API failed', { status: response.status, accountId }, isServerError);
        return null;
      }
      
      // PRODUCTION FIX: Handle potential HTML responses gracefully
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        this.logError('Progress API returned non-JSON response', { 
          contentType, 
          accountId,
          status: response.status 
        }, false);
        return null;
      }
      
      const progressData = await response.json();
      return progressData;
    } catch (error) {
      // PRODUCTION FIX: Handle JSON parsing errors specifically
      if (error instanceof SyntaxError && error.message.includes('JSON')) {
        this.logError('JSON parsing error - server returned non-JSON response', {
          error: error.message,
          accountId: await this.getAccountId().catch(() => 'unknown')
        }, false);
      } else {
        this.logError('Error fetching closure progress', error, false);
      }
      return null;
    }
  }

  /**
   * Retry/resume account closure process for the current authenticated user
   * ARCHITECTURAL FIX: This service only works with the current session user
   */
  async retryClosureProcess(): Promise<RetryResponse> {
    try {
      const accountId = await this.getAccountId();
      
      if (!accountId) {
        this.logError('No account ID found for retry', {}, false);
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
        // Log all errors for observability, but use appropriate levels
        const isServerError = response.status >= 500;
        this.logError('Resume endpoint failed', { status: response.status, accountId }, isServerError);
        return { success: false };
      }
      
      return await response.json();
    } catch (error) {
      this.logError('Error during retry/resume', error, false);
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