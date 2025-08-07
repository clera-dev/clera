import React, { useState, useEffect } from 'react';

interface SuggestedQuestionProps {
  onSelect: (question: string) => void;
}

const SuggestedQuestions: React.FC<SuggestedQuestionProps> = ({ onSelect }) => {
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile devices
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const questions = [
    "How is this account split between stocks and bonds?",
    "What news is impacting my portfolio today?",
    "How can I diversify better?",
    "How can I improve my risk score?",
    "Can you optimize my portfolio?",
    "What is my worst performing investment?"
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