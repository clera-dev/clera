import React from 'react';
import { useBreakpoint } from '@/hooks/useBreakpoint';

interface SuggestedQuestionProps {
  onSelect: (question: string) => void;
}

const SuggestedQuestions: React.FC<SuggestedQuestionProps> = ({ onSelect }) => {
  const { isMobile } = useBreakpoint();

  const questions = [
    "What is my current stock vs. bond mix, and is it sensible long term?",
    "Summarize today’s market news that actually matters for me.",
    "Where am I over‑concentrated, and how can I diversify smartly?",
    "My risk and diversification scores: what 1–2 actions improve them?",
    "Suggest 1–2 concrete tweaks to optimize my portfolio.",
    "Which positions are dragging performance, and what are my options?"
  ];

  return (
    <div className={`px-3 mb-3 mt-auto ${isMobile ? 'mobile-suggested-questions' : ''}`}>
      <div className={`grid gap-2 ${
        isMobile 
          ? 'grid-cols-2 grid-rows-3' // Mobile: 3 rows of 2 questions
          : 'grid-cols-1 md:grid-cols-2' // Desktop: original layout
      }`}>
        {questions.map((question, index) => (
          <button
            key={index}
            onClick={() => onSelect(question)}
            className={`${
              isMobile
                ? 'py-2 px-3 text-xs' // Mobile: compact padding and smaller text
                : 'py-3 px-4 text-sm' // Desktop: original padding and text size
            } bg-zinc-900 hover:bg-zinc-800 rounded-lg text-center transition-colors duration-200 shadow-sm`}
          >
            <span className="text-white font-medium leading-tight">
              {question}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default SuggestedQuestions; 