"use client";

import { useEffect, useState, useRef } from "react";
import { Loader2 } from "lucide-react";

interface LoadingCardProps {
  title: string;
  message: string;
  onComplete?: () => void;
  completeDelayMs?: number;
  showDots?: boolean;
}

export default function LoadingCard({
  title,
  message,
  onComplete,
  completeDelayMs = 0,
  showDots = true,
}: LoadingCardProps) {
  const [dots, setDots] = useState("");
  const onCompleteRef = useRef(onComplete);

  // Keep the ref updated with the latest onComplete function
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!showDots) return;
    const interval = setInterval(() => {
      setDots((prev) => (prev === "..." ? "" : prev + "."));
    }, 500);
    return () => clearInterval(interval);
  }, [showDots]);

  useEffect(() => {
    if (!onCompleteRef.current || !completeDelayMs) return;
    const t = setTimeout(() => {
      onCompleteRef.current?.();
    }, completeDelayMs);
    return () => clearTimeout(t);
  }, [completeDelayMs]); // Only depend on completeDelayMs, not onComplete

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="max-w-md mx-auto text-center space-y-6">
        <div className="relative">
          <div className="absolute -top-16 -left-16 w-32 h-32 bg-primary/5 rounded-full blur-xl" />
          <div className="absolute -bottom-8 -right-8 w-24 h-24 bg-blue-500/5 rounded-full blur-lg" />
          <div className="bg-card border border-border/30 rounded-xl p-8 shadow-lg relative">
            <div className="flex justify-center mb-6">
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
            </div>
            <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
              {title}
            </h2>
            <p className="text-muted-foreground text-lg">{message}{showDots ? dots : null}</p>
            <div className="mt-6 pt-6 border-t border-border/30">
              <p className="text-sm text-muted-foreground">This will only take a moment</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


