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
import { AlertTriangle, X, Loader2, Skull } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ClosureState } from "@/hooks/useAccountClosure";

interface FinalConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  userName: string;
  closureState: ClosureState;
}

export default function FinalConfirmationModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  onCancel,
  userName,
  closureState
}: FinalConfirmationModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Skull className="h-5 w-5" />
            Final Confirmation Required
          </DialogTitle>
          <DialogDescription className="text-red-600 font-medium">
            {userName}, this is your last chance to cancel.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert className="border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              <strong>POINT OF NO RETURN:</strong> After this confirmation, your account 
              closure cannot be stopped or reversed.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-md border">
              <h4 className="font-medium mb-2">What has been completed:</h4>
              <ul className="space-y-1 text-sm text-gray-600">
                <li>✓ All open orders have been cancelled</li>
                <li>✓ All positions have been liquidated</li>
                <li>✓ Your account is ready for final closure</li>
              </ul>
            </div>

            <div className="bg-red-50 p-4 rounded-md border border-red-200">
              <h4 className="font-medium text-red-800 mb-2">
                Clicking "Close Account" will immediately:
              </h4>
              <ul className="space-y-1 text-sm text-red-700">
                <li>• Transfer all remaining funds to your bank account</li>
                <li>• Permanently close your investment account</li>
                <li>• Make your account number invalid forever</li>
                <li>• Prevent any future access to this account</li>
              </ul>
            </div>

            <div className="text-center p-4 bg-yellow-50 rounded-md border border-yellow-200">
              <p className="text-sm font-medium text-yellow-800">
                Are you absolutely certain you want to permanently close your account?
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            className="w-full sm:w-auto"
            disabled={closureState.isProcessing}
          >
            <X className="mr-2 h-4 w-4" />
            Nevermind, Keep My Account
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            className="w-full sm:w-auto bg-red-600 hover:bg-red-700"
            disabled={closureState.isProcessing}
          >
            {closureState.isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Closing Account...
              </>
            ) : (
              <>
                <Skull className="mr-2 h-4 w-4" />
                Yes, Close Account Forever
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 