interface ProgressBarProps {
  currentStep: number;
  totalSteps: number;
  stepNames?: string[];
  percentComplete?: number;
}

export default function ProgressBar({ 
  currentStep, 
  totalSteps,
  stepNames,
  percentComplete
}: ProgressBarProps) {
  // Use provided percentComplete if available, otherwise calculate
  const progress = percentComplete !== undefined ? 
    percentComplete : 
    Math.round((currentStep / totalSteps) * 100);
  
  return (
    <div className="w-full mb-4 sm:mb-8 px-4 sm:px-0 pt-4 sm:pt-0">
      <div className="flex justify-between mb-2 text-sm font-medium">
        <span>Step {currentStep} of {totalSteps}</span>
        <span>{progress}%</span>
      </div>
      <div className="w-full bg-gray-700/20 rounded-full h-3 shadow-inner">
        <div 
          className="bg-primary h-3 rounded-full transition-all duration-500 ease-in-out shadow-[0_0_8px_rgba(59,130,246,0.5)]" 
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
} 