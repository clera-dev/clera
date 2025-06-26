"use client";

import { Button } from "@/components/ui/button";
import { Trash2, Loader2 } from "lucide-react";

interface AccountClosureButtonProps {
  onInitiateClosure: () => void;
  disabled?: boolean;
}

export default function AccountClosureButton({ onInitiateClosure, disabled }: AccountClosureButtonProps) {
  return (
    <Button
      variant="outline"
      size="default"
      onClick={onInitiateClosure}
      disabled={disabled}
      className="border-red-200 hover:bg-red-50 hover:border-red-300 text-red-700 hover:text-red-800 font-medium transition-colors"
    >
      {disabled ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Processing...
        </>
      ) : (
        <>
          <Trash2 className="mr-2 h-4 w-4" />
          Close Account
        </>
      )}
    </Button>
  );
} 