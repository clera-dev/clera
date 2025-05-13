import React from 'react';

interface SuggestedQuestionProps {
  onSelect: (question: string) => void;
}

const SuggestedQuestions: React.FC<SuggestedQuestionProps> = ({ onSelect }) => {
  const questions = [
    "How is this account split between stocks and bonds?",
    "What news is impacting my Portfolio today?",
    "How can I diversify better?",
    "How can I improve my risk score?",
    "Can you Optimize my Portfolio?",
    "What is my worst performing Investment?"
  ];

  return (
    <div className="px-3 mb-3 mt-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {questions.map((question, index) => (
          <button
            key={index}
            onClick={() => onSelect(question)}
            className="py-3 px-4 bg-zinc-900 hover:bg-zinc-800 rounded-lg text-center transition-colors duration-200 shadow-sm"
          >
            <span className="text-white text-sm font-medium">{question}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default SuggestedQuestions; 