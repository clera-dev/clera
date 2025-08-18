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
  const fieldErrors: Record<string, string> = {};

  const isUnicodeLetter = (ch: string): boolean => {
    if (!ch) return false;
    const lower = ch.toLowerCase();
    const upper = ch.toUpperCase();
    return lower !== upper; // Works for most Unicode letters
  };

  const isAllowedNameChar = (ch: string): boolean => {
    return isUnicodeLetter(ch) || ch === ' ' || ch === '-' || ch === "'";
  };

  if (!data.firstName || data.firstName.trim().length < 1 || data.firstName.trim().length > 50) {
    const msg = "First name must be 1-50 characters";
    errors.push(msg);
    fieldErrors.firstName = msg;
  } else {
    const name = data.firstName.trim();
    // Reject if contains disallowed characters
    for (const ch of name) {
      if (!isAllowedNameChar(ch)) {
        const msg = "First name can include letters, spaces, apostrophes, or hyphens";
        errors.push(msg);
        fieldErrors.firstName = msg;
        break;
      }
    }
    // No double spaces between parts
    if (/\s{2,}/.test(name)) {
      const msg = "Please avoid multiple consecutive spaces in your name";
      errors.push(msg);
      fieldErrors.firstName = msg;
    }
  }

  if (!data.investmentGoals || data.investmentGoals.length === 0) {
    const msg = "Please select at least one investment goal";
    errors.push(msg);
    fieldErrors.investmentGoals = msg;
  }
  if (data.investmentGoals && data.investmentGoals.length > 5) {
    const msg = "Please select no more than 5 investment goals";
    errors.push(msg);
    fieldErrors.investmentGoals = msg;
  }

  if (!data.riskTolerance) {
    const msg = "Please select your risk tolerance";
    errors.push(msg);
    fieldErrors.riskTolerance = msg;
  }

  if (!data.investmentTimeline) {
    const msg = "Please select your investment timeline";
    errors.push(msg);
    fieldErrors.investmentTimeline = msg;
  }

  if (!data.experienceLevel) {
    const msg = "Please select your experience level";
    errors.push(msg);
    fieldErrors.experienceLevel = msg;
  }

  if (data.monthlyInvestmentGoal !== undefined) {
    if (
      typeof data.monthlyInvestmentGoal !== 'number' ||
      Number.isNaN(data.monthlyInvestmentGoal) ||
      data.monthlyInvestmentGoal < 1 ||
      data.monthlyInvestmentGoal > 10000
    ) {
      const msg = "Monthly investment goal must be between $1 and $10,000";
      errors.push(msg);
      fieldErrors.monthlyInvestmentGoal = msg;
    }
  }

  if (!data.marketInterests || data.marketInterests.length === 0) {
    const msg = "Please select at least one market or investment interest";
    errors.push(msg);
    fieldErrors.marketInterests = msg;
  } else if (data.marketInterests.length > 5) {
    const msg = "Please select no more than 5 market interests";
    errors.push(msg);
    fieldErrors.marketInterests = msg;
  }

  return {
    isValid: errors.length === 0,
    errors,
    fieldErrors,
  };
};

// Note: Database formatting functions have been moved to server-side API routes
// to maintain proper architectural boundaries and prevent client-side exposure
// of database schema details.

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
