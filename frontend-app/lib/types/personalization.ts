/**
 * Personalization TypeScript interfaces and enums
 * Defines all types for user personalization data collection and management
 */

// Investment Goals Enum - matches database constraints
export enum InvestmentGoal {
  RETIREMENT = "retirement",
  HOUSE = "house", 
  BIG_PURCHASE = "big_purchase",
  EXTRA_INCOME = "extra_income",
  PAY_OFF_DEBT = "pay_off_debt",
  FOR_FUN = "for_fun",
  INHERITANCE = "inheritance",
  TRAVEL = "travel",
  NOT_SURE = "not_sure"
}

// Risk Tolerance Enum - matches database constraints
export enum RiskTolerance {
  CONSERVATIVE = "conservative",
  MODERATE = "moderate", 
  AGGRESSIVE = "aggressive"
}

// Investment Timeline Enum - matches database constraints
export enum InvestmentTimeline {
  LESS_THAN_1_YEAR = "less_than_1_year",
  ONE_TO_THREE_YEARS = "1_to_3_years",
  THREE_TO_FIVE_YEARS = "3_to_5_years", 
  FIVE_TO_TEN_YEARS = "5_to_10_years",
  TEN_PLUS_YEARS = "10_plus_years"
}

// Experience Level Enum - matches database constraints
export enum ExperienceLevel {
  NO_EXPERIENCE = "no_experience",
  SOME_FAMILIARITY = "some_familiarity",
  COMFORTABLE = "comfortable", 
  PROFESSIONAL = "professional"
}

// Market Interests Enum
export enum MarketInterest {
  GLOBAL_POLITICS = "global_politics",
  TRADE = "trade",
  STOCKS = "stocks",
  BONDS = "bonds", 
  ECONOMY = "economy",
  TECHNOLOGY = "technology",
  HEALTHCARE = "healthcare",
  UTILITY = "utility",
  MATERIALS = "materials",
  CONSUMER_STAPLES = "consumer_staples",
  CONSUMER_DISCRETIONARY = "consumer_discretionary",
  INDUSTRIALS = "industrials",
  COMMUNICATION_SERVICES = "communication_services",
  ENERGY = "energy",
  FINANCIALS = "financials",
  REAL_ESTATE = "real_estate"
}

// Main personalization data interface - matches database schema
export interface PersonalizationData {
  firstName: string;
  investmentGoals: InvestmentGoal[];
  riskTolerance: RiskTolerance;
  investmentTimeline: InvestmentTimeline;
  experienceLevel: ExperienceLevel;
  monthlyInvestmentGoal: number;
  marketInterests: MarketInterest[];
}

// Database record interface (includes metadata)
export interface PersonalizationRecord extends PersonalizationData {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

// Helper type for form validation
export interface PersonalizationFormData extends Partial<PersonalizationData> {
  // All fields optional for progressive form completion
}

// Validation result interface
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

// Helper descriptions for UI display
export const INVESTMENT_GOAL_DESCRIPTIONS: Record<InvestmentGoal, string> = {
  [InvestmentGoal.RETIREMENT]: "Saving for retirement",
  [InvestmentGoal.HOUSE]: "Buying a house",
  [InvestmentGoal.BIG_PURCHASE]: "Saving for a big purchase", 
  [InvestmentGoal.EXTRA_INCOME]: "To generate extra income every month",
  [InvestmentGoal.PAY_OFF_DEBT]: "To help pay off debt every month",
  [InvestmentGoal.FOR_FUN]: "Investing for fun",
  [InvestmentGoal.INHERITANCE]: "Leave an inheritance",
  [InvestmentGoal.TRAVEL]: "Travel",
  [InvestmentGoal.NOT_SURE]: "Not sure yet"
};

export const RISK_TOLERANCE_DESCRIPTIONS: Record<RiskTolerance, string> = {
  [RiskTolerance.CONSERVATIVE]: "I would reduce my investments to limit further losses",
  [RiskTolerance.MODERATE]: "I would keep my investments and wait for the market to recover", 
  [RiskTolerance.AGGRESSIVE]: "I would increase my investments to take advantage of lower prices"
};

export const INVESTMENT_TIMELINE_DESCRIPTIONS: Record<InvestmentTimeline, string> = {
  [InvestmentTimeline.LESS_THAN_1_YEAR]: "Less than 1 year",
  [InvestmentTimeline.ONE_TO_THREE_YEARS]: "1-3 years",
  [InvestmentTimeline.THREE_TO_FIVE_YEARS]: "3-5 years",
  [InvestmentTimeline.FIVE_TO_TEN_YEARS]: "5-10 years", 
  [InvestmentTimeline.TEN_PLUS_YEARS]: "10+ years"
};

export const EXPERIENCE_LEVEL_DESCRIPTIONS: Record<ExperienceLevel, string> = {
  [ExperienceLevel.NO_EXPERIENCE]: "I have no experience with investing",
  [ExperienceLevel.SOME_FAMILIARITY]: "I have some familiarity with it but don't really know how it works",
  [ExperienceLevel.COMFORTABLE]: "I have been investing for a while and feel comfortable talking about my investments and the market",
  [ExperienceLevel.PROFESSIONAL]: "I work in finance or investing"
};

export const MARKET_INTEREST_DESCRIPTIONS: Record<MarketInterest, string> = {
  [MarketInterest.GLOBAL_POLITICS]: "Global politics",
  [MarketInterest.TRADE]: "Trade", 
  [MarketInterest.STOCKS]: "Stocks",
  [MarketInterest.BONDS]: "Bonds",
  [MarketInterest.ECONOMY]: "Economy",
  [MarketInterest.TECHNOLOGY]: "Technology",
  [MarketInterest.HEALTHCARE]: "Healthcare", 
  [MarketInterest.UTILITY]: "Utility",
  [MarketInterest.MATERIALS]: "Materials",
  [MarketInterest.CONSUMER_STAPLES]: "Consumer staples",
  [MarketInterest.CONSUMER_DISCRETIONARY]: "Consumer discretionary",
  [MarketInterest.INDUSTRIALS]: "Industrials",
  [MarketInterest.COMMUNICATION_SERVICES]: "Communication services",
  [MarketInterest.ENERGY]: "Energy",
  [MarketInterest.FINANCIALS]: "Financials",
  [MarketInterest.REAL_ESTATE]: "Real estate"
};

// Helper function to validate personalization data
export const validatePersonalizationData = (data: PersonalizationFormData): ValidationResult => {
  const errors: string[] = [];
  
  // First name validation
  if (!data.firstName || data.firstName.trim().length < 1 || data.firstName.trim().length > 50) {
    errors.push('First name must be 1-50 characters');
  } else {
    // Allow letters with optional single spaces or hyphens between parts, but no leading/trailing spaces
    const namePattern = /^(?! )[A-Za-z]+(?:[ -][A-Za-z]+)*(?<! )$/;
    if (!namePattern.test(data.firstName)) {
      errors.push('First name can only include letters, single spaces, or hyphens');
    }
  }
  
  // Investment goals validation
  if (!data.investmentGoals || data.investmentGoals.length === 0) {
    errors.push('Please select at least one investment goal');
  }
  if (data.investmentGoals && data.investmentGoals.length > 5) {
    errors.push('Please select no more than 5 investment goals');
  }
  
  // Risk tolerance validation
  if (!data.riskTolerance) {
    errors.push('Please select your risk tolerance');
  }
  
  // Investment timeline validation
  if (!data.investmentTimeline) {
    errors.push('Please select your investment timeline');
  }
  
  // Experience level validation
  if (!data.experienceLevel) {
    errors.push('Please select your experience level');
  }
  
  // Monthly investment goal validation
  if (data.monthlyInvestmentGoal !== undefined) {
    if (data.monthlyInvestmentGoal < 1 || data.monthlyInvestmentGoal > 10000) {
      errors.push('Monthly investment goal must be between $1 and $10,000');
    }
  }
  
  // Market interests validation (REQUIRED: at least 1, max 5)
  if (!data.marketInterests || data.marketInterests.length === 0) {
    errors.push('Please select at least one market or investment interest');
  } else if (data.marketInterests.length > 5) {
    errors.push('Please select no more than 5 market interests');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

// Helper function to convert form data to database format
export const formatPersonalizationForDatabase = (data: PersonalizationData): Record<string, any> => {
  return {
    first_name: data.firstName.trim(),
    investment_goals: data.investmentGoals,
    risk_tolerance: data.riskTolerance,
    investment_timeline: data.investmentTimeline,
    experience_level: data.experienceLevel,
    monthly_investment_goal: data.monthlyInvestmentGoal,
    market_interests: data.marketInterests
  };
};

// Helper function to convert database format to app format
export const formatPersonalizationFromDatabase = (record: any): PersonalizationData => {
  return {
    firstName: record.first_name,
    investmentGoals: record.investment_goals || [],
    riskTolerance: record.risk_tolerance,
    investmentTimeline: record.investment_timeline,
    experienceLevel: record.experience_level,
    monthlyInvestmentGoal: record.monthly_investment_goal,
    marketInterests: record.market_interests || []
  };
};

// Default/initial personalization data
export const initialPersonalizationData: PersonalizationFormData = {
  firstName: '',
  investmentGoals: [],
  riskTolerance: undefined,
  investmentTimeline: undefined,
  experienceLevel: undefined,
  monthlyInvestmentGoal: 250,
  marketInterests: []
};
