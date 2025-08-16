"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { saveOrUpdatePersonalizationData } from "@/utils/api/personalization-client";
import { 
  PersonalizationData,
  PersonalizationFormData,
  InvestmentGoal,
  RiskTolerance,
  InvestmentTimeline,
  ExperienceLevel,
  MarketInterest,
  INVESTMENT_GOAL_DESCRIPTIONS,
  RISK_TOLERANCE_DESCRIPTIONS,
  INVESTMENT_TIMELINE_DESCRIPTIONS,
  EXPERIENCE_LEVEL_DESCRIPTIONS,
  MARKET_INTEREST_DESCRIPTIONS,
} from "@/lib/types/personalization";
import { validatePersonalizationData, initialPersonalizationData } from "@/utils/services/personalization-data";
import { Check, Rocket, Smile, Shield } from "lucide-react";

interface PersonalizationStepProps {
  data: PersonalizationFormData;
  onUpdate: (data: Partial<PersonalizationFormData>) => void;
  onContinue: () => void;
  onBack?: () => void;
}

export default function PersonalizationStep({ 
  data, 
  onUpdate, 
  onContinue, 
  onBack 
}: PersonalizationStepProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Mobile-first: Show one question at a time on mobile, all on desktop
  const [isMobile, setIsMobile] = useState(false);

  // Timeline temp state for smooth desktop drag
  const [tempTimelineIndex, setTempTimelineIndex] = useState<number | null>(null);
  
  // Monthly goal temp state for smooth desktop drag
  const [tempMonthlyValue, setTempMonthlyValue] = useState<number | null>(null);

  // Mobile-only: banner to summarize missing fields on final submit
  const [mobileValidation, setMobileValidation] = useState<{ missingKeys: string[]; firstInvalidStep: number } | null>(null);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const validateForm = () => {
    const validation = validatePersonalizationData(data);
    const mappedErrors: Record<string, string> = {};
    for (const err of validation.errors) {
      if (err.toLowerCase().includes('first name')) mappedErrors.firstName = err;
      else if (err.toLowerCase().includes('goal')) mappedErrors.investmentGoals = err;
      else if (err.toLowerCase().includes('risk')) mappedErrors.riskTolerance = err;
      else if (err.toLowerCase().includes('timeline')) mappedErrors.investmentTimeline = err;
      else if (err.toLowerCase().includes('experience')) mappedErrors.experienceLevel = err;
      else if (err.toLowerCase().includes('interest')) mappedErrors.marketInterests = err;
    }
    setErrors(mappedErrors);
    return validation.isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Run validation synchronously and map errors so we can show mobile banner immediately
    const validation = validatePersonalizationData(data);
    const mappedErrors: Record<string, string> = {};
    for (const err of validation.errors) {
      const lower = err.toLowerCase();
      if (lower.includes('first name')) mappedErrors.firstName = err;
      else if (lower.includes('goal')) mappedErrors.investmentGoals = err;
      else if (lower.includes('risk')) mappedErrors.riskTolerance = err;
      else if (lower.includes('timeline')) mappedErrors.investmentTimeline = err;
      else if (lower.includes('experience')) mappedErrors.experienceLevel = err;
      else if (lower.includes('interest')) mappedErrors.marketInterests = err;
    }
    setErrors(mappedErrors);

    if (!validation.isValid) {
      // On mobile, show a concise banner with missing required sections and CTA to jump
      if (isMobile) {
        const requiredOrder: Record<string, number> = {
          firstName: 0,
          investmentGoals: 1,
          riskTolerance: 2,
          investmentTimeline: 3,
          experienceLevel: 4,
          marketInterests: 5
        };
        const missingKeys = Object.keys(requiredOrder).filter((k) => Boolean(mappedErrors[k]));
        const firstInvalidStep = missingKeys.length
          ? missingKeys.map((k) => requiredOrder[k]).sort((a, b) => a - b)[0]
          : 0;
        setMobileValidation({ missingKeys, firstInvalidStep });
        // Gently bring the banner into view after a brief delay to avoid interfering with touch events
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 100);
      } else {
        // Desktop: keep prior behavior of focusing first invalid area
        if (mappedErrors.firstName) {
          document
            .querySelector('input[placeholder="First name"]')
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (mappedErrors.investmentGoals) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setMobileValidation(null);

    try {
      // Save personalization data to the API
      const result = await saveOrUpdatePersonalizationData(data);
      
      if (result.success) {
        onContinue();
      } else {
        setSubmitError(result.error || 'Failed to save personalization data');
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error('Error saving personalization data:', error);
      setSubmitError('An unexpected error occurred. Please try again.');
      setIsSubmitting(false);
    }
  };

  const nextMobileStep = () => {
    if (currentStep < 6) setCurrentStep(currentStep + 1);
  };

  const prevMobileStep = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  // Investment Goals Selection
  const GoalsSection = () => (
    <div className="space-y-4">
      <div>
        <Label className="text-lg font-semibold">What investing goals can I help you achieve?</Label>
        <p className="text-sm text-muted-foreground mt-1">Select all that apply</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.entries(INVESTMENT_GOAL_DESCRIPTIONS).map(([goal, description]) => {
          const isSelected = data.investmentGoals?.includes(goal as InvestmentGoal);
          return (
            <Card
              key={goal}
              className={cn(
                "cursor-pointer transition-all duration-200 hover:shadow-md",
                isSelected 
                  ? "border-primary bg-primary/5 shadow-sm" 
                  : "border-border hover:border-primary/50"
              )}
              onClick={() => {
                const currentGoals = data.investmentGoals || [];
                if (isSelected) {
                  onUpdate({
                    investmentGoals: currentGoals.filter(g => g !== goal)
                  });
                  const remaining = currentGoals.filter(g => g !== goal);
                  setErrors((prev) => ({ ...prev, investmentGoals: remaining.length > 0 ? '' : prev.investmentGoals }));
                  setMobileValidation(null);
                } else if (currentGoals.length < 5) {
                  onUpdate({
                    investmentGoals: [...currentGoals, goal as InvestmentGoal]
                  });
                  setErrors((prev) => ({ ...prev, investmentGoals: '' }));
                  setMobileValidation(null);
                }
              }}
            >
              <CardContent className="p-4 flex items-center justify-between min-h-[60px]">
                <span className="text-sm font-medium">{description}</span>
                {isSelected && (
                  <Check className="h-5 w-5 text-primary flex-shrink-0 ml-2" />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {data.investmentGoals && data.investmentGoals.length >= 5 && (
        <p className="text-sm text-muted-foreground">Maximum 5 goals selected</p>
      )}
      {errors.investmentGoals && (
        <p className="text-red-500 text-sm">{errors.investmentGoals}</p>
      )}
    </div>
  );

  // Risk Tolerance Selection
  const RiskToleranceSection = () => (
    <div className="space-y-4">
      <div>
        <Label className="text-lg font-semibold">
          Imagine your portfolio drops by 20% in a single month. Which best describes your reaction?
        </Label>
      </div>
      <div className="grid grid-cols-1 gap-4">
        {Object.entries(RISK_TOLERANCE_DESCRIPTIONS).map(([tolerance, description]) => {
          const isSelected = data.riskTolerance === tolerance;
          const getIcon = () => {
            switch (tolerance) {
              case 'conservative': return <Shield className="h-6 w-6 text-amber-600" />; // Protection-first vibe
              case 'moderate': return <Smile className="h-6 w-6 text-blue-500" />;
              case 'aggressive': return <Rocket className="h-6 w-6 text-green-500" />;
              default: return null;
            }
          };
          
          return (
            <Card
              key={tolerance}
              className={cn(
                "cursor-pointer transition-all duration-200 hover:shadow-md",
                isSelected 
                  ? "border-primary bg-primary/5 shadow-sm" 
                  : "border-border hover:border-primary/50"
              )}
              onClick={() => {
                onUpdate({ riskTolerance: tolerance as RiskTolerance });
                setErrors((prev) => ({ ...prev, riskTolerance: '' }));
                setMobileValidation(null);
              }}
            >
              <CardContent className="p-4 flex items-start gap-3">
                {getIcon()}
                <div className="flex-1">
                  <p className="text-sm font-medium capitalize mb-1">
                    {tolerance === 'conservative' ? 'Conservative' : 
                     tolerance === 'moderate' ? 'Moderate' : 'Aggressive/Risky'}
                  </p>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
                {isSelected && (
                  <Check className="h-5 w-5 text-primary flex-shrink-0" />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {errors.riskTolerance && (
        <p className="text-red-500 text-sm">{errors.riskTolerance}</p>
      )}
    </div>
  );

  // Investment Timeline Selection
  const TimelineSection = () => {
    const timelineOptions = Object.entries(INVESTMENT_TIMELINE_DESCRIPTIONS);
    const selectedIndex = data.investmentTimeline 
      ? timelineOptions.findIndex(([key]) => key === data.investmentTimeline)
      : 2; // Default to middle option

    // Use the parent component's temp state for smooth desktop drag
    const displayIndex = tempTimelineIndex !== null ? tempTimelineIndex : selectedIndex;

    return (
      <div className="space-y-6">
        <div>
          <Label className="text-lg font-semibold">How long do you plan to be investing for?</Label>
        </div>
        
        <div className="space-y-4">
          <Slider
            value={[displayIndex]}
            onValueChange={([value]) => {
              setTempTimelineIndex(value);
            }}
            onValueCommit={([value]) => {
              const timeline = timelineOptions[value][0] as InvestmentTimeline;
              setTempTimelineIndex(value);
              onUpdate({ investmentTimeline: timeline });
              setErrors((prev) => ({ ...prev, investmentTimeline: '' }));
              setMobileValidation(null);
            }}
            max={timelineOptions.length - 1}
            step={1}
            className="w-full"
          />
          
          <div className="flex justify-between text-sm text-muted-foreground px-2">
            {timelineOptions.map(([_, description], index) => (
              <span 
                key={index}
                className={cn(
                  "text-center flex-1 transition-colors",
                  index === displayIndex && "text-primary font-medium"
                )}
              >
                {description}
              </span>
            ))}
          </div>
          
          {data.investmentTimeline && (
            <div className="text-center p-3 bg-primary/5 rounded-lg border border-primary/20">
              <p className="text-lg font-semibold text-primary">
                {INVESTMENT_TIMELINE_DESCRIPTIONS[data.investmentTimeline]}
              </p>
            </div>
          )}
        </div>
        
        {errors.investmentTimeline && (
          <p className="text-red-500 text-sm">{errors.investmentTimeline}</p>
        )}
      </div>
    );
  };

  // Experience Level Selection
  const ExperienceSection = () => (
    <div className="space-y-4">
      <div>
        <Label className="text-lg font-semibold">How familiar are you with investing and financial markets?</Label>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {Object.entries(EXPERIENCE_LEVEL_DESCRIPTIONS).map(([level, description]) => {
          const isSelected = data.experienceLevel === level;
          
          return (
            <Card
              key={level}
              className={cn(
                "cursor-pointer transition-all duration-200 hover:shadow-md",
                isSelected 
                  ? "border-primary bg-primary/5 shadow-sm" 
                  : "border-border hover:border-primary/50"
              )}
              onClick={() => {
                onUpdate({ experienceLevel: level as ExperienceLevel });
                setErrors((prev) => ({ ...prev, experienceLevel: '' }));
                setMobileValidation(null);
              }}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <p className="text-sm font-medium">{description}</p>
                {isSelected && (
                  <Check className="h-5 w-5 text-primary flex-shrink-0 ml-2" />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {errors.experienceLevel && (
        <p className="text-red-500 text-sm">{errors.experienceLevel}</p>
      )}
    </div>
  );

  // Monthly Investment Goal Section
  const MonthlyGoalSection = () => {
    // Single value monthly goal
    const selectedValue =
      (typeof data.monthlyInvestmentGoal === 'number' && data.monthlyInvestmentGoal > 0
        ? data.monthlyInvestmentGoal
        : 250);

    // Use the parent component's temp state for smooth desktop drag
    const displayValue = tempMonthlyValue !== null ? tempMonthlyValue : selectedValue;
    
    return (
      <div className="space-y-6">
        <div>
          <Label className="text-lg font-semibold">
            Do you have a goal for how much you want to invest on a monthly basis?
          </Label>
          <p className="text-sm text-muted-foreground mt-1">
            This is for information purposes only. I will never withdraw money from your account without your prior direction.
          </p>
        </div>
        
        <div className="space-y-4">
          <Slider
            value={[displayValue]}
                        onValueChange={([val]) => {
              // Update local value only while dragging to preserve pointer capture
              setTempMonthlyValue(val);
            }}
            onValueCommit={([val]) => {
              // Snap only on commit to avoid jitter during drag
              const snapped = (() => {
                if (val <= 1) return 1;
                const rounded = Math.round(val / 25) * 25;
                return Math.min(1000, Math.max(25, rounded));
              })();
              setTempMonthlyValue(snapped);
              onUpdate({ monthlyInvestmentGoal: snapped });
            }}
            max={1000}
            min={1}
            step={1}
            className="w-full"
          />
          
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>$1</span>
            <span>$500</span>
            <span>$1,000+</span>
          </div>
          
          <div className="text-center p-4 bg-primary/5 rounded-lg border border-primary/20">
            <p className="text-xl font-bold text-primary">
              ${displayValue}{displayValue >= 1000 ? '+' : ''}
            </p>
            <p className="text-sm text-muted-foreground">per month</p>
          </div>
        </div>
      </div>
    );
  };

  // Market Interests Selection
  const MarketInterestsSection = () => (
    <div className="space-y-4">
      <div>
        <Label className="text-lg font-semibold">
          What kind of industries, investments,or market news are you interested in?
        </Label>
        <p className="text-sm text-muted-foreground mt-1">Select up to 5</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {Object.entries(MARKET_INTEREST_DESCRIPTIONS).map(([interest, description]) => {
          const isSelected = data.marketInterests?.includes(interest as MarketInterest);
          return (
            <Card
              key={interest}
              className={cn(
                "cursor-pointer transition-all duration-200 hover:shadow-md",
                isSelected 
                  ? "border-primary bg-primary/5 shadow-sm" 
                  : "border-border hover:border-primary/50"
              )}
              onClick={() => {
                const currentInterests = data.marketInterests || [];
                if (isSelected) {
                  onUpdate({
                    marketInterests: currentInterests.filter(i => i !== interest)
                  });
                  const remaining = currentInterests.filter(i => i !== interest);
                  setErrors((prev) => ({ ...prev, marketInterests: remaining.length > 0 ? '' : 'Please select at least one market or investment interest' }));
                  setMobileValidation(null);
                } else if (currentInterests.length < 5) {
                  onUpdate({
                    marketInterests: [...currentInterests, interest as MarketInterest]
                  });
                  setErrors((prev) => ({ ...prev, marketInterests: '' }));
                  setMobileValidation(null);
                }
              }}
            >
              <CardContent className="p-3 flex items-center justify-between min-h-[60px]">
                <span className="text-sm font-medium text-center w-full">{description}</span>
                {isSelected && (
                  <Check className="h-4 w-4 text-primary flex-shrink-0 ml-1" />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {data.marketInterests && data.marketInterests.length >= 5 && (
        <p className="text-sm text-muted-foreground">Maximum 5 interests selected</p>
      )}
      {errors.marketInterests && (
        <p className="text-red-500 text-sm">{errors.marketInterests}</p>
      )}
    </div>
  );

  // Mobile step navigation
  const mobileSteps = [
    { title: "Your Name", component: () => (
      <div className="space-y-4">
        <div>
          <Label className="text-lg font-semibold">What's your name?</Label>
        </div>
        <Input
          value={data.firstName || ''}
          onChange={(e) => {
            // disallow digits; allow letters, spaces, hyphens
            const raw = e.target.value;
            const stripped = raw.replace(/[0-9]/g, '');
            onUpdate({ firstName: stripped });
            // Live validation for immediate feedback
            const { errors: errList } = validatePersonalizationData({
              ...data,
              firstName: stripped
            });
            const firstErr = errList.find((er) => er.toLowerCase().includes('first name'));
            setErrors((prev) => ({ ...prev, firstName: firstErr || '' }));
            setMobileValidation(null);
          }}
          placeholder="First name"
          className={cn("text-lg h-12", errors.firstName && "border-red-500")}
        />
        {errors.firstName && <p className="text-red-500 text-sm">{errors.firstName}</p>}
      </div>
    )},
    { title: "Investment Goals", component: GoalsSection },
    { title: "Risk Tolerance", component: RiskToleranceSection },
    { title: "Investment Timeline", component: TimelineSection },
    { title: "Experience Level", component: ExperienceSection },
    { title: "Monthly Investment Goal", component: MonthlyGoalSection },
    { title: "Market Interests", component: MarketInterestsSection }
  ];

  if (isMobile) {
    return (
      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto p-4 sm:p-8">
        {/* Progress header (clean KYC-style) */}
        <div className="mb-4 sm:mb-8">
          <div className="mb-2 text-sm text-muted-foreground">Step {currentStep + 1} of {mobileSteps.length}</div>
          <div className="w-full bg-gray-700/20 rounded-full h-2">
            <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${Math.round(((currentStep + 1) / mobileSteps.length) * 100)}%` }} />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold mt-3 bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
            {mobileSteps[currentStep].title}
          </h2>
        </div>

        {/* Mobile validation banner when trying to complete with missing fields */}
        {mobileValidation && (
          <div className="mb-4 p-3 rounded-md border border-amber-200 bg-amber-50">
            <p className="text-amber-800 text-sm font-medium mb-1">
              Please complete all required sections before finishing.
            </p>
            <p className="text-amber-700 text-xs">
              Missing: {mobileValidation.missingKeys
                .map((k) => (
                  k === 'firstName' ? 'Name' :
                  k === 'investmentGoals' ? 'Goals' :
                  k === 'riskTolerance' ? 'Risk tolerance' :
                  k === 'investmentTimeline' ? 'Investment timeline' :
                  k === 'experienceLevel' ? 'Experience level' :
                  k === 'marketInterests' ? 'Market interests' : k
                ))
                .join(', ')}
            </p>
          </div>
        )}

        <div className="space-y-6 bg-card/50 p-6 rounded-lg border border-border/30 shadow-sm min-h-[400px]">
          {mobileSteps[currentStep].component()}
        </div>

        <div className="flex justify-between">
          <Button 
            type="button" 
            variant="outline" 
            onClick={currentStep === 0 ? onBack : prevMobileStep}
            disabled={!onBack && currentStep === 0}
          >
            Back
          </Button>
          
          {currentStep < mobileSteps.length - 1 ? (
            <Button 
              type="button" 
              onClick={nextMobileStep}
              className="bg-gradient-to-r from-primary to-blue-600 hover:shadow-lg"
            >
              Continue
            </Button>
          ) : (
            <Button 
              type="submit" 
              disabled={isSubmitting}
              className="bg-gradient-to-r from-primary to-blue-600 hover:shadow-lg"
            >
              {isSubmitting ? 'Saving...' : 'Complete'}
            </Button>
          )}
        </div>

        {/* Error display for mobile */}
        {submitError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-600 text-sm font-medium">Error: {submitError}</p>
          </div>
        )}
      </form>
    );
  }

  // Desktop: Show all questions
  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl mx-auto p-4 sm:p-8">
      {/* Progress header (clean KYC-style) */}
      <div className="mb-4 sm:mb-8">
        <div className="mb-2 text-sm text-muted-foreground">Step 1 of 6</div>
        <div className="w-full bg-gray-700/20 rounded-full h-2">
          <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `100%` }} />
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold mt-3 bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
          Let's Personalize Your Experience
        </h2>
        <p className="text-muted-foreground text-sm sm:text-base mt-1">
          This will help me provide the best advice.
        </p>
      </div>

      {/* Name Input */}
      <div className="space-y-6 bg-card/50 p-6 rounded-lg border border-border/30 shadow-sm">
        <div>
          <Label className="text-lg font-semibold">What's your name?</Label>
        </div>
        <Input
          value={data.firstName || ''}
          onChange={(e) => {
            const raw = e.target.value;
            const stripped = raw.replace(/[0-9]/g, '');
            onUpdate({ firstName: stripped });
            const { errors: errList } = validatePersonalizationData({
              ...data,
              firstName: stripped
            });
            const firstErr = errList.find((er) => er.toLowerCase().includes('first name'));
            setErrors((prev) => ({ ...prev, firstName: firstErr || '' }));
            setMobileValidation(null);
          }}
          placeholder="First name"
          className={cn("max-w-md", errors.firstName && "border-red-500")}
        />
        {errors.firstName && <p className="text-red-500 text-sm">{errors.firstName}</p>}
      </div>

      {/* Investment Goals */}
      <div className="space-y-6 bg-card/50 p-6 rounded-lg border border-border/30 shadow-sm">
        <GoalsSection />
      </div>

      {/* Risk Tolerance */}
      <div className="space-y-6 bg-card/50 p-6 rounded-lg border border-border/30 shadow-sm">
        <RiskToleranceSection />
      </div>

      {/* Investment Timeline */}
      <div className="space-y-6 bg-card/50 p-6 rounded-lg border border-border/30 shadow-sm">
        <TimelineSection />
      </div>

      {/* Experience Level */}
      <div className="space-y-6 bg-card/50 p-6 rounded-lg border border-border/30 shadow-sm">
        <ExperienceSection />
      </div>

      {/* Monthly Investment Goal */}
      <div className="space-y-6 bg-card/50 p-6 rounded-lg border border-border/30 shadow-sm">
        <MonthlyGoalSection />
      </div>

      {/* Market Interests */}
      <div className="space-y-6 bg-card/50 p-6 rounded-lg border border-border/30 shadow-sm">
        <MarketInterestsSection />
      </div>

      {/* Submit Button */}
      <div className="flex justify-between">
        <Button 
          type="button" 
          variant="outline" 
          onClick={onBack}
          disabled={!onBack}
        >
          Back
        </Button>
        <Button 
          type="submit" 
          disabled={isSubmitting}
          className="bg-gradient-to-r from-primary to-blue-600 hover:shadow-lg"
        >
          {isSubmitting ? 'Saving...' : 'Complete Personalization'}
        </Button>
      </div>

      {/* Error display for desktop */}
      {submitError && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-600 text-sm font-medium">Error: {submitError}</p>
        </div>
      )}
    </form>
  );
}
