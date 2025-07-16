"use client";

import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useAccountClosure } from '@/hooks/useAccountClosure';
import { useClosureProgress } from '@/hooks/useClosureProgress';
import ProgressSteps from './ProgressSteps';
import ClosureDetails from './ClosureDetails';

interface AccountClosurePendingProps {
  userId: string;
}

/**
 * Main component for displaying account closure pending status
 * Now follows proper architectural patterns with separated concerns:
 * - Data fetching delegated to custom hooks
 * - Business logic handled by service layer
 * - UI components separated by responsibility
 * - No direct API calls or complex state management
 */
export default function AccountClosurePending({ userId }: AccountClosurePendingProps) {
  // Data management through custom hooks
  const { closureData, loading: closureDataLoading } = useAccountClosure();
  const {
    closureSteps,
    lastUpdateStatus,
    isRetrying,
    autoRetryEnabled,
    nextRetryIn,
    hasFailed,
    isInProgress,
    handleRetryResume
  } = useClosureProgress(userId);

  // Show loading state while initial data is being fetched
  if (closureDataLoading) {
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
          {/* Header Section */}
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

          {/* Closure Details Component */}
          <ClosureDetails closureData={closureData} />

          {/* Progress Steps Component */}
          <ProgressSteps
            closureSteps={closureSteps}
            lastUpdateStatus={lastUpdateStatus}
            isRetrying={isRetrying}
            autoRetryEnabled={autoRetryEnabled}
            nextRetryIn={nextRetryIn}
            hasFailed={hasFailed}
            onRetryResume={handleRetryResume}
          />
        </div>
      </div>
    </div>
  );
} 