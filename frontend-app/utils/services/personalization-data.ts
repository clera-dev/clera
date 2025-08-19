import {
  PersonalizationData,
  PersonalizationFormData,
  ValidationResult,
} from "@/lib/types/personalization";

// Pre-compile heavy regexes at module scope to avoid re-allocation per validation call
let UNICODE_LETTER_REGEX: RegExp | null = null;
try {
  UNICODE_LETTER_REGEX = new RegExp("\\\\p{L}", "u");
} catch {
  UNICODE_LETTER_REGEX = null;
}

// Broad fallback covering major scripts when Unicode property escapes are unavailable
const FALLBACK_LETTER_REGEX = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u0531-\u058F\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F\u0E00-\u0E7F\u0F00-\u0FFF\u1000-\u109F\u10A0-\u10FF\u1100-\u11FF\u1200-\u137F\u13A0-\u13FF\u1400-\u167F\u1680-\u169F\u16A0-\u16FF\u1780-\u17FF\u18A9\u1900-\u194F\u1950-\u197F\u1A00-\u1A1F\u1B00-\u1B7F\u1C00-\u1C4F\u1C50-\u1C7F\u1CD0-\u1CFF\u1E00-\u1EFF\u2C00-\u2C5F\u2D00-\u2D2F\u2D30-\u2D7F\u2D80-\u2DDF\u2E80-\u2EFF\u3040-\u309F\u30A0-\u30FF\u3130-\u318F\u31F0-\u31FF\u3400-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/;

// Validation
export const validatePersonalizationData = (
  data: PersonalizationFormData
): ValidationResult => {
  const errors: string[] = [];
  const fieldErrors: Record<string, string> = {};

  const isUnicodeLetter = (ch: string): boolean => {
    if (!ch) return false;
    if (UNICODE_LETTER_REGEX) return UNICODE_LETTER_REGEX.test(ch);
    return FALLBACK_LETTER_REGEX.test(ch);
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
