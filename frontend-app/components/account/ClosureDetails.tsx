import React from 'react';
import { Clock, ArrowRight } from 'lucide-react';
import { ClosureData } from '@/utils/services/accountClosureService';

interface ClosureDetailsProps {
  closureData: ClosureData | null;
}

/**
 * Component for rendering closure confirmation details and next steps
 * Handles display of confirmation number, dates, and process information
 */
export default function ClosureDetails({ closureData }: ClosureDetailsProps) {
  return (
    <>
      {/* Confirmation Details */}
      <div className="bg-gray-900 rounded-lg p-6 mb-8 border border-gray-700">
        <div className="grid grid-cols-1 gap-4">
          <div>
            <p className="text-sm font-medium text-gray-300">Confirmation Number</p>
            <p className="text-lg font-mono text-white bg-black/30 px-3 py-2 rounded border border-gray-600">
              {closureData?.confirmationNumber || 'Loading...'}
            </p>
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
            <p className="text-white">{closureData?.estimatedCompletion || 'Calculating...'}</p>
          </div>
        </div>
      </div>

      {/* What Happens Next */}
      {closureData?.nextSteps && closureData.nextSteps.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-200 mb-4 flex items-center">
            <Clock className="w-5 h-5 mr-2" />
            What happens next
          </h2>
          <div className="space-y-3">
            {closureData.nextSteps.map((step, index) => (
              <div key={index} className="flex items-start">
                <ArrowRight className="w-4 h-4 text-blue-400 mt-1 mr-3 flex-shrink-0" />
                <p className="text-gray-300">{step}</p>
              </div>
            ))}
          </div>
        </div>
      )}

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
    </>
  );
} 