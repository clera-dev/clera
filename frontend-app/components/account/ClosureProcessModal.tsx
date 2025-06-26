"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Check, X, Loader2, AlertTriangle } from "lucide-react";
import { ClosureState } from "@/hooks/useAccountClosure";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ClosureProcessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
  onCancel: () => void;
  closureState: ClosureState;
}

export default function ClosureProcessModal({ 
  isOpen, 
  onClose, 
  onContinue, 
  onCancel,
  closureState 
}: ClosureProcessModalProps) {
  const completedSteps = closureState.steps.filter(step => step.status === 'completed').length;
  const progressPercentage = (completedSteps / closureState.steps.length) * 100;
  const currentStep = closureState.steps[closureState.currentStep];
  const hasError = closureState.error || closureState.steps.some(step => step.status === 'failed');
  const canProceedToFinal = completedSteps >= 3 && !hasError; // After liquidation

  const getStepIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <Check className="h-4 w-4 text-green-600" />;
      case 'in-progress':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
      case 'failed':
        return <X className="h-4 w-4 text-red-600" />;
      default:
        return <div className="h-4 w-4 rounded-full border-2 border-gray-300" />;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            Account Closure in Progress
          </DialogTitle>
          <DialogDescription>
            Please wait while we process your account closure request.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span>{completedSteps} of {closureState.steps.length} steps completed</span>
            </div>
            <Progress value={progressPercentage} className="w-full" />
          </div>

          {/* Error Display */}
          {hasError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {closureState.error || 'An error occurred during the closure process.'}
              </AlertDescription>
            </Alert>
          )}

          {/* Steps List */}
          <div className="space-y-3">
            {closureState.steps.map((step, index) => (
              <div 
                key={step.id}
                className={`flex items-start gap-3 p-3 rounded-md transition-colors ${
                  index === closureState.currentStep && step.status === 'in-progress'
                    ? 'bg-blue-50 border border-blue-200'
                    : step.status === 'completed'
                    ? 'bg-green-50 border border-green-200'
                    : step.status === 'failed'
                    ? 'bg-red-50 border border-red-200'
                    : 'bg-gray-50 border border-gray-200'
                }`}
              >
                <div className="mt-0.5">
                  {getStepIcon(step.status)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                  {step.error && (
                    <p className="text-xs text-red-600 mt-1">{step.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Next Steps Info */}
          {canProceedToFinal && !hasError && (
            <div className="bg-yellow-50 p-4 rounded-md border border-yellow-200">
              <p className="text-sm text-yellow-800">
                <strong>Ready for Final Step:</strong> Your positions have been liquidated. 
                You can now proceed to the final confirmation to complete the account closure.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {closureState.canCancel && (
            <Button
              variant="outline"
              onClick={onCancel}
              className="w-full sm:w-auto"
              disabled={closureState.isProcessing}
            >
              Cancel Process
            </Button>
          )}
          
          {canProceedToFinal && !hasError && (
            <Button
              onClick={onContinue}
              className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white"
              disabled={closureState.isProcessing}
            >
              Proceed to Final Confirmation
            </Button>
          )}
          
          {hasError && (
            <Button
              variant="outline"
              onClick={onClose}
              className="w-full sm:w-auto"
            >
              Close
            </Button>
          )}

          {/* Success State - Process Completed */}
          {closureState.isComplete && (
            <Button
              onClick={onClose}
              className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white"
            >
              View Confirmation
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 