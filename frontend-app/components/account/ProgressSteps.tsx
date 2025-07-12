import React from 'react';
import { CheckCircle, Loader2, AlertCircle, Clock, RefreshCw } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { ClosureStep } from '@/utils/services/accountClosureService';

interface ProgressStepsProps {
  closureSteps: ClosureStep[];
  lastUpdateStatus: 'loading' | 'success' | 'error';
  isRetrying: boolean;
  autoRetryEnabled: boolean;
  nextRetryIn: number | null;
  hasFailed: boolean;
  onRetryResume: () => Promise<void>;
}

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

/**
 * Component for rendering closure progress steps
 * Handles step visualization, error states, and retry functionality
 */
export default function ProgressSteps({
  closureSteps,
  lastUpdateStatus,
  isRetrying,
  autoRetryEnabled,
  nextRetryIn,
  hasFailed,
  onRetryResume
}: ProgressStepsProps) {
  return (
    <div className="bg-card border border-border rounded-lg p-6 mb-8">
      <h2 className="text-xl font-semibold text-gray-200 mb-4 flex items-center">
        <Clock className="w-5 h-5 mr-2" />
        Closure Progress
      </h2>
      
      {/* Failure Alert */}
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
                  onClick={onRetryResume}
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
      
      {/* Progress Steps */}
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

      {/* Status Footer */}
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
  );
} 