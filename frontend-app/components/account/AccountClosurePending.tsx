"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, Loader2, AlertCircle, CheckCircle2, Clock, ArrowRight, RefreshCw } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { Button } from "@/components/ui/button";

interface AccountClosurePendingProps {
  userId: string;
}

interface ClosureData {
  confirmationNumber?: string;
  initiatedAt?: string;
  estimatedCompletion?: string;
  bankAccount?: string;
  nextSteps?: string[];
}

interface ClosureStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  error?: string;
}

export default function AccountClosurePending({ userId }: AccountClosurePendingProps) {
  const [closureData, setClosureData] = useState<ClosureData | null>(null);
  const [closureSteps, setClosureSteps] = useState<ClosureStep[]>([
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
  ]);
  const [loading, setLoading] = useState(true);
  const [lastUpdateStatus, setLastUpdateStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [isRetrying, setIsRetrying] = useState(false);
  const [autoRetryEnabled, setAutoRetryEnabled] = useState(false);
  const [nextRetryIn, setNextRetryIn] = useState<number | null>(null);

  // Shared function to fetch closure progress
  const fetchClosureProgress = async () => {
    try {
      setLastUpdateStatus('loading');
      console.log('[AccountClosure] 🔄 Starting progress fetch...');
      
      // Get account ID from Supabase (more reliable than localStorage)
      const supabase = createClient();
      const { data: onboardingData } = await supabase
        .from('user_onboarding')
        .select('alpaca_account_id')
        .eq('user_id', userId)
        .single();
      
      const accountId = onboardingData?.alpaca_account_id;
      console.log('[AccountClosure] 📋 Account ID retrieved:', accountId);
      
      if (!accountId) {
        console.warn('[AccountClosure] ⚠️ No account ID found for progress polling');
        setLastUpdateStatus('error');
        return;
      }
      
      console.log('[AccountClosure] 🌐 Making API call to:', `/api/account-closure/progress/${accountId}`);
      const response = await fetch(`/api/account-closure/progress/${accountId}`);
      console.log('[AccountClosure] 📡 API Response status:', response.status);
      
      if (response.ok) {
        const progressData = await response.json();
        console.log('[AccountClosure] ✅ Progress data received:', progressData);
        console.log('[AccountClosure] 📋 Status details:', progressData.status_details);
        
        // Update closure data with immutable values from progress response
        if (progressData.confirmation_number && !closureData?.confirmationNumber) {
          console.log('[AccountClosure] 🔄 Updating confirmation number from progress:', progressData.confirmation_number);
          setClosureData(prev => ({
            ...(prev ?? {}),
            confirmationNumber: progressData.confirmation_number,
            initiatedAt: progressData.initiated_at || prev?.initiatedAt
          }));
        }
        
        // Update steps based on backend progress
        setClosureSteps(prevSteps => {
          console.log('[AccountClosure] 🔄 Updating steps from:', prevSteps);
          const updatedSteps = [...prevSteps];
          
          // Update step statuses based on backend response
          if (progressData.current_step) {
            console.log('[AccountClosure] 📍 Current backend step:', progressData.current_step);
            
            const stepMapping: Record<string, number> = {
              'initiated': 0,
              'liquidating_positions': 1,  // Combined: cancel orders + liquidate (our step 1)
              'waiting_settlement': 2,
              'withdrawing_funds': 3,
              'closing_account': 4,
              'completed': 5,
              'failed': -1  // Special handling for failed status
            };
            
            const currentStepIndex = stepMapping[progressData.current_step];
            console.log('[AccountClosure] 🎯 Mapped to frontend step index:', currentStepIndex);
            
            if (progressData.current_step === 'failed') {
              console.log('[AccountClosure] 💥 Account closure has FAILED');
              
              // Find which step failed based on steps_completed
              const failedStepIndex = Math.max(0, (progressData.steps_completed || 0) + 1);
              console.log(`[AccountClosure] ❌ Failure occurred at step ${failedStepIndex}`);
              
              // Mark completed steps as completed
              for (let i = 0; i < failedStepIndex && i < updatedSteps.length; i++) {
                console.log(`[AccountClosure] ✅ Marking step ${i} (${updatedSteps[i].title}) as completed`);
                updatedSteps[i].status = 'completed';
              }
              
              // Mark the failed step
              if (failedStepIndex < updatedSteps.length) {
                console.log(`[AccountClosure] ❌ Marking step ${failedStepIndex} (${updatedSteps[failedStepIndex].title}) as failed`);
                updatedSteps[failedStepIndex].status = 'failed';
                
                // Get specific error message from backend
                let errorMessage = 'Process failed - please contact support';
                if (progressData.status_details?.error) {
                  errorMessage = progressData.status_details.error;
                } else if (progressData.status_details?.reason) {
                  errorMessage = progressData.status_details.reason;
                }
                
                updatedSteps[failedStepIndex].error = errorMessage;
                console.log(`[AccountClosure] 📝 Error message set:`, errorMessage);
              }
              
              // Mark remaining steps as pending
              for (let i = failedStepIndex + 1; i < updatedSteps.length; i++) {
                console.log(`[AccountClosure] ⏸️ Keeping step ${i} (${updatedSteps[i].title}) as pending`);
                updatedSteps[i].status = 'pending';
              }
            } else if (currentStepIndex !== undefined) {
              // Mark previous steps as completed
              for (let i = 0; i < currentStepIndex && i < updatedSteps.length; i++) {
                console.log(`[AccountClosure] ✅ Marking step ${i} (${updatedSteps[i].title}) as completed`);
                updatedSteps[i].status = 'completed';
              }
              
              // Mark current step as in-progress (unless completed)
              if (currentStepIndex < updatedSteps.length && progressData.current_step !== 'completed') {
                console.log(`[AccountClosure] ⏳ Marking step ${currentStepIndex} (${updatedSteps[currentStepIndex].title}) as in-progress`);
                updatedSteps[currentStepIndex].status = 'in-progress';
              } else if (progressData.current_step === 'completed') {
                console.log('[AccountClosure] 🎉 All steps completed!');
                // Mark all steps as completed
                for (let i = 0; i < updatedSteps.length; i++) {
                  updatedSteps[i].status = 'completed';
                }
              }
              
              // Mark remaining steps as pending
              for (let i = currentStepIndex + 1; i < updatedSteps.length; i++) {
                console.log(`[AccountClosure] ⏸️ Keeping step ${i} (${updatedSteps[i].title}) as pending`);
                updatedSteps[i].status = 'pending';
              }
            } else {
              console.warn('[AccountClosure] ⚠️ Unhandled backend step (not failed or mapped):', progressData.current_step);
            }
          } else {
            console.warn('[AccountClosure] ⚠️ No current_step in progress data');
          }
          
          console.log('[AccountClosure] 🔄 Updated steps to:', updatedSteps);
          return updatedSteps;
        });
        
        setLastUpdateStatus('success');
        console.log('[AccountClosure] ✅ Progress update completed successfully');
      } else {
        const responseText = await response.text();
        console.error(`[AccountClosure] ❌ Progress API responded with status ${response.status}:`, responseText);
        setLastUpdateStatus('error');
      }
    } catch (error) {
      console.error('[AccountClosure] 💥 Error fetching closure progress:', error);
      setLastUpdateStatus('error');
    }
  };

  // Function to handle retry/resume
  const handleRetryResume = useCallback(async () => {
    try {
      setIsRetrying(true);
      console.log('[AccountClosure] 🔄 Starting retry/resume process...');
      
      // Get account ID from Supabase
      const supabase = createClient();
      const { data: onboardingData } = await supabase
        .from('user_onboarding')
        .select('alpaca_account_id')
        .eq('user_id', userId)
        .single();
      
      const accountId = onboardingData?.alpaca_account_id;
      
      if (!accountId) {
        console.error('[AccountClosure] ❌ No account ID found for retry');
        return;
      }
      
      console.log('[AccountClosure] 🚀 Calling resume endpoint for account:', accountId);
      
      // Call the resume endpoint
      const response = await fetch(`/api/account-closure/resume/${accountId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({})  // ACH relationship will be auto-found
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('[AccountClosure] ✅ Resume operation completed:', result);
        
        // Update UI based on result
        if (result.success) {
          console.log('[AccountClosure] 🎉 Resume successful, action taken:', result.action_taken);
          
          // Immediately refresh progress
          setTimeout(() => {
            fetchClosureProgress();
          }, 1000);
          
          setAutoRetryEnabled(false);
          setNextRetryIn(null);
        } else if (result.can_retry && result.next_retry_in_seconds) {
          console.log('[AccountClosure] ⏰ Setting up auto-retry in', result.next_retry_in_seconds, 'seconds');
          setAutoRetryEnabled(true);
          setNextRetryIn(result.next_retry_in_seconds);
        }
      } else {
        const errorText = await response.text();
        console.error('[AccountClosure] ❌ Resume endpoint failed:', response.status, errorText);
      }
    } catch (error) {
      console.error('[AccountClosure] 💥 Error during retry/resume:', error);
    } finally {
      setIsRetrying(false);
    }
  }, [userId, fetchClosureProgress]);

  // Auto-retry countdown effect
  useEffect(() => {
    if (autoRetryEnabled && nextRetryIn !== null && nextRetryIn > 0) {
      const countdown = setInterval(() => {
        setNextRetryIn(prev => {
          if (prev === null || prev <= 1) {
            return null;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => clearInterval(countdown);
    }
  }, [autoRetryEnabled, nextRetryIn]);

  // Separate effect to trigger retry when countdown reaches zero
  useEffect(() => {
    if (autoRetryEnabled && nextRetryIn === 0) {
      setAutoRetryEnabled(false);
      handleRetryResume();
    }
  }, [autoRetryEnabled, nextRetryIn, handleRetryResume]);

  // Main effect for initial load and polling
  useEffect(() => {
    const fetchClosureData = async () => {
      try {
        setLoading(true);
        console.log('[AccountClosure] 📥 Starting closure data fetch...');
        
        // Fetch real closure data from Supabase via API
        const response = await fetch('/api/account-closure/data');
        
        if (response.ok) {
          const result = await response.json();
          console.log('[AccountClosure] ✅ Closure data received:', result.data);
          
          if (result.success && result.data) {
            setClosureData({
              confirmationNumber: result.data.confirmationNumber,
              initiatedAt: result.data.initiatedAt,
              estimatedCompletion: result.data.estimatedCompletion,
              nextSteps: result.data.nextSteps
            });
          } else {
            console.error('[AccountClosure] ❌ No closure data in response');
            setClosureData(null);
          }
        } else {
          console.error('[AccountClosure] ❌ Failed to fetch closure data:', response.status);
          setClosureData(null);
        }
      } catch (error) {
        console.error('[AccountClosure] 💥 Error fetching closure data:', error);
        setClosureData(null);
      } finally {
        setLoading(false);
        console.log('[AccountClosure] 📥 Closure data fetch completed');
      }
    };

    fetchClosureData();
    fetchClosureProgress();
    
    // Poll for progress updates every 60 seconds
    const progressInterval = setInterval(fetchClosureProgress, 60000);
    
    return () => clearInterval(progressInterval);
  }, [userId]);

  const getStepIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'in-progress':
        return <Loader2 className="h-5 w-5 animate-spin text-blue-600" />;
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      default:
        return <div className="h-5 w-5 rounded-full border-2 border-gray-300" />;
    }
  };

  // Check if any step has failed
  const hasFailed = closureSteps.some(step => step.status === 'failed');
  const isInProgress = closureSteps.some(step => step.status === 'in-progress');

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-card border border-border rounded-lg p-8 shadow-sm">
          {/* Success Icon and Title */}
          <div className="text-center mb-8">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-200 mb-2">
              Account Closure Initiated
            </h1>
            <p className="text-gray-400">
              Your account closure process has started successfully
            </p>
          </div>

          {/* Confirmation Details */}
          <div className="bg-gray-900 rounded-lg p-6 mb-8 border border-gray-700">
            <div className="grid grid-cols-1 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-300">Confirmation Number</p>
                <p className="text-lg font-mono text-white bg-black/30 px-3 py-2 rounded border border-gray-600">{closureData?.confirmationNumber}</p>
              </div>
              
              {closureData?.initiatedAt && (
                <div>
                  <p className="text-sm font-medium text-gray-300">Process Started</p>
                  <p className="text-white">
                    {new Date(closureData.initiatedAt).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              )}
              
              <div>
                <p className="text-sm font-medium text-gray-300">Estimated Completion</p>
                <p className="text-white">{closureData?.estimatedCompletion}</p>
              </div>
            </div>
          </div>

          {/* Real-Time Progress Steps */}
          <div className="bg-card border border-border rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-200 mb-4 flex items-center">
              <Clock className="w-5 h-5 mr-2" />
              Closure Progress
            </h2>
            
            {/* Check if any step has failed */}
            {hasFailed && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start">
                  <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-red-800 mb-2">Account Closure Paused</h3>
                    <p className="text-sm text-red-700 mb-3">
                      The closure process encountered an issue and has been paused. You can try again or contact support for assistance.
                    </p>

                    <div className="flex items-center gap-3 mt-4">
                      <Button 
                        onClick={handleRetryResume}
                        disabled={isRetrying || autoRetryEnabled}
                        variant="outline"
                        size="sm"
                        className="text-red-700 border-red-300 hover:bg-red-100"
                      >
                        {isRetrying ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Retrying...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Try Again
                          </>
                        )}
                      </Button>
                      
                      {autoRetryEnabled && nextRetryIn && (
                        <div className="text-sm text-red-600 flex items-center">
                          <Clock className="w-4 h-4 mr-1" />
                          Auto-retry in {nextRetryIn}s
                        </div>
                      )}
                    </div>

                    <div className="mt-3 text-sm">
                      <p className="font-medium text-red-800">Need help?</p>
                      <p className="text-red-700">Contact support at support@askclera.com if the issue persists.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div className="space-y-4">
              {closureSteps.map((step, index) => (
                <div 
                  key={step.id}
                  className={`flex items-start gap-4 p-4 rounded-lg border transition-colors ${
                    step.status === 'in-progress'
                      ? 'bg-blue-50 border-blue-200'
                      : step.status === 'completed'
                      ? 'bg-green-50 border-green-200'
                      : step.status === 'failed'
                      ? 'bg-red-50 border-red-200'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="mt-0.5">
                    {getStepIcon(step.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{step.title}</p>
                    <p className="text-xs text-gray-600">{step.description}</p>
                    {step.error && (
                      <p className="text-xs text-red-600 mt-1">{step.error}</p>
                    )}
                    {step.status === 'in-progress' && (
                      <p className="text-xs text-blue-600 mt-1">Processing...</p>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {index + 1} of {closureSteps.length}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-blue-50 rounded-md border border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-800">
                    <strong>Live Updates:</strong> This page refreshes automatically every 60 seconds to show progress updates.
                    {isRetrying && <span className="ml-2 text-orange-800">Attempting to resume closure process...</span>}
                  </p>
                </div>
                <div className="flex items-center">
                  {(lastUpdateStatus === 'loading' || isRetrying) && (
                    <div className="flex items-center text-blue-600">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      <span className="text-xs">{isRetrying ? 'Retrying...' : 'Updating...'}</span>
                    </div>
                  )}
                  {lastUpdateStatus === 'success' && !isRetrying && (
                    <div className="flex items-center text-green-600">
                      <CheckCircle className="w-4 h-4 mr-2" />
                      <span className="text-xs">Updated</span>
                    </div>
                  )}
                  {lastUpdateStatus === 'error' && !isRetrying && (
                    <div className="flex items-center text-red-600">
                      <AlertCircle className="w-4 h-4 mr-2" />
                      <span className="text-xs">Update failed</span>
                    </div>
                  )}
                  {autoRetryEnabled && nextRetryIn && (
                    <div className="flex items-center text-orange-600 ml-3">
                      <Clock className="w-4 h-4 mr-1" />
                      <span className="text-xs">Auto-retry: {nextRetryIn}s</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* What Happens Next */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-200 mb-4 flex items-center">
              <Clock className="w-5 h-5 mr-2" />
              What happens next
            </h2>
            <div className="space-y-3">
              {closureData?.nextSteps?.map((step, index) => (
                <div key={index} className="flex items-start">
                  <ArrowRight className="w-4 h-4 text-blue-400 mt-1 mr-3 flex-shrink-0" />
                  <p className="text-gray-300">{step}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Important Notice */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="w-5 h-5 text-amber-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-amber-800">Important</h3>
                <p className="text-sm text-amber-700 mt-1">
                  This account is no longer active. You can safely sign out and will receive email updates on the closure progress.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 