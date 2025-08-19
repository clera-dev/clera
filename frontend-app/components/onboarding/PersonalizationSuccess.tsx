"use client";

import LoadingCard from "./LoadingCard";

interface PersonalizationSuccessProps {
  onComplete: () => void;
}

export default function PersonalizationSuccess({ onComplete }: PersonalizationSuccessProps) {
  return (
    <LoadingCard
      title="Personalization saved!"
      message="Let’s move on to verifying your account details"
      onComplete={onComplete}
      completeDelayMs={1600}
      showDots
    />
  );
}


