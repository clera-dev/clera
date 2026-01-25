"use client";

import LoadingCard from "./LoadingCard";

interface PersonalizationSuccessProps {
  onComplete: () => void;
}

export default function PersonalizationSuccess({ onComplete }: PersonalizationSuccessProps) {
  return (
    <LoadingCard
      title="Information saved!"
      message="Next, let's connect your brokerage account"
      onComplete={onComplete}
      completeDelayMs={1600}
      showDots
    />
  );
}
