"use client";

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface OrderCancelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
  orderSymbol?: string;
  orderId?: string;
}

export const OrderCancelModal: React.FC<OrderCancelModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
  orderSymbol,
  orderId
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md mx-4 rounded-lg">
        <DialogHeader className="text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
            <DialogTitle className="text-lg font-semibold">
              Confirming Order Cancellation
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm text-muted-foreground">
            This cannot be undone. Please select "Cancel Order" below if you wish to proceed.
          </DialogDescription>
          {orderSymbol && (
            <div className="mt-2 p-2 bg-muted rounded text-xs">
              <span className="font-medium">Symbol:</span> {orderSymbol}
              {orderId && (
                <div className="mt-1">
                  <span className="font-medium">Order ID:</span> {orderId.substring(0, 12)}...
                </div>
              )}
            </div>
          )}
        </DialogHeader>
        
        <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="w-full sm:w-auto order-2 sm:order-1"
          >
            No, go back
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isLoading}
            className="w-full sm:w-auto order-1 sm:order-2"
          >
            {isLoading ? "Cancelling..." : "Cancel Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};