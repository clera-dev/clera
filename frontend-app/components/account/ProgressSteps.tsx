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
      return <CheckCircle className="h-5 w-5 text-green-400" />;
    case 'in-progress':
      return <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />;
    case 'failed':
      return <AlertCircle className="h-5 w-5 text-red-400" />;
    default:
      return <div className="h-5 w-5 rounded-full border-2 border-gray-600" />;
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
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-8 mb-8">
      <h2 className="text-2xl font-semibold text-white mb-6 flex items-center">
        <Clock className="w-6 h-6 mr-3 text-cyan-400" />
        Closure Progress
      </h2>
      
      {/* Failure Alert */}
      {hasFailed && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-800/50 rounded-lg">
          <div className="flex items-start">
            <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 mr-3 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-red-300 mb-2">Account Closure Paused</h3>
              <p className="text-sm text-red-200 mb-3">
                The closure process encountered an issue and has been paused. You can try again or contact support for assistance.
              </p>

              <div className="flex items-center gap-3 mt-4">
                <Button 
                  onClick={onRetryResume}
                  disabled={isRetrying || autoRetryEnabled}
                  variant="outline"
                  size="sm"
                  className="text-red-300 border-red-600 hover:bg-red-800/20"
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
                  <div className="text-sm text-red-400 flex items-center">
                    <Clock className="w-4 h-4 mr-1" />
                    Auto-retry in {nextRetryIn}s
                  </div>
                )}
              </div>

              <div className="mt-3 text-sm">
                <p className="font-medium text-red-300">Need help?</p>
                <p className="text-red-200">Contact support at support@askclera.com if the issue persists.</p>
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
                ? 'bg-cyan-900/20 border-cyan-800/50'
                : step.status === 'completed'
                ? 'bg-green-900/20 border-green-800/50'
                : step.status === 'failed'
                ? 'bg-red-900/20 border-red-800/50'
                : 'bg-gray-800/30 border-gray-700'
            }`}
          >
            <div className="mt-0.5">
              {getStepIcon(step.status)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{step.title}</p>
              <p className="text-xs text-gray-400">{step.description}</p>
              {step.error && (
                <p className="text-xs text-red-400 mt-1">{step.error}</p>
              )}
              {step.status === 'in-progress' && (
                <p className="text-xs text-cyan-400 mt-1">Processing...</p>
              )}
            </div>
            <div className="text-xs text-gray-500">
              {index + 1} of {closureSteps.length}
            </div>
          </div>
        ))}
      </div>

      {/* Status Footer */}
      <div className="mt-6 p-4 bg-cyan-900/20 rounded-lg border border-cyan-800/50">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-cyan-300">
              <strong>Live Updates:</strong> This page refreshes automatically every 60 seconds to show progress updates.
              {isRetrying && <span className="ml-2 text-orange-400">Attempting to resume closure process...</span>}
            </p>
          </div>
          <div className="flex items-center">
            {(lastUpdateStatus === 'loading' || isRetrying) && (
              <div className="flex items-center text-cyan-400">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                <span className="text-xs">{isRetrying ? 'Retrying...' : 'Updating...'}</span>
              </div>
            )}
            {lastUpdateStatus === 'success' && !isRetrying && (
              <div className="flex items-center text-green-400">
                <CheckCircle className="w-4 h-4 mr-2" />
                <span className="text-xs">Updated</span>
              </div>
            )}
            {lastUpdateStatus === 'error' && !isRetrying && (
              <div className="flex items-center text-red-400">
                <AlertCircle className="w-4 h-4 mr-2" />
                <span className="text-xs">Update failed</span>
              </div>
            )}
            {autoRetryEnabled && nextRetryIn && (
              <div className="flex items-center text-orange-400 ml-3">
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