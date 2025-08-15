import {
  PersonalizationData,
  PersonalizationFormData,
  ValidationResult,
} from "@/lib/types/personalization";

// Validation
export const validatePersonalizationData = (
  data: PersonalizationFormData
): ValidationResult => {
  const errors: string[] = [];

  if (!data.firstName || data.firstName.trim().length < 1 || data.firstName.trim().length > 50) {
    errors.push("First name must be 1-50 characters");
  } else {
    // Safari-safe: avoid look-behind; ensure segments of letters separated by single space or hyphen
    // This pattern inherently disallows leading/trailing spaces
    const namePattern = /^[A-Za-z]+(?:[ -][A-Za-z]+)*$/;
    if (!namePattern.test(data.firstName)) {
      errors.push("First name can only include letters, single spaces, or hyphens");
    }
  }

  if (!data.investmentGoals || data.investmentGoals.length === 0) {
    errors.push("Please select at least one investment goal");
  }
  if (data.investmentGoals && data.investmentGoals.length > 5) {
    errors.push("Please select no more than 5 investment goals");
  }

  if (!data.riskTolerance) {
    errors.push("Please select your risk tolerance");
  }

  if (!data.investmentTimeline) {
    errors.push("Please select your investment timeline");
  }

  if (!data.experienceLevel) {
    errors.push("Please select your experience level");
  }

  if (data.monthlyInvestmentGoal !== undefined) {
    if (typeof data.monthlyInvestmentGoal !== 'number' || Number.isNaN(data.monthlyInvestmentGoal) || data.monthlyInvestmentGoal < 1 || data.monthlyInvestmentGoal > 10000) {
      errors.push("Monthly investment goal must be between $1 and $10,000");
    }
  }

  if (!data.marketInterests || data.marketInterests.length === 0) {
    errors.push("Please select at least one market or investment interest");
  } else if (data.marketInterests.length > 5) {
    errors.push("Please select no more than 5 market interests");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// DB formatters
export const formatPersonalizationForDatabase = (
  data: PersonalizationData
): Record<string, any> => {
  return {
    first_name: data.firstName.trim(),
    investment_goals: data.investmentGoals,
    risk_tolerance: data.riskTolerance,
    investment_timeline: data.investmentTimeline,
    experience_level: data.experienceLevel,
    monthly_investment_goal: data.monthlyInvestmentGoal,
    market_interests: data.marketInterests,
  };
};

export const formatPersonalizationFromDatabase = (record: any): PersonalizationData => {
  return {
    firstName: record.first_name,
    investmentGoals: record.investment_goals || [],
    riskTolerance: record.risk_tolerance,
    investmentTimeline: record.investment_timeline,
    experienceLevel: record.experience_level,
    monthlyInvestmentGoal: record.monthly_investment_goal,
    marketInterests: record.market_interests || [],
  };
};

// Initial form data
export const initialPersonalizationData: PersonalizationFormData = {
  firstName: "",
  investmentGoals: [],
  riskTolerance: undefined,
  investmentTimeline: undefined,
  experienceLevel: undefined,
  monthlyInvestmentGoal: 250,
  marketInterests: [],
};
